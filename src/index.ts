import { Worker } from '@notionhq/workers';
import { j } from '@notionhq/workers/schema-builder';

import { default as axios } from 'axios';
import { parseISO, subDays } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

const worker = new Worker();
export default worker;

const oura = axios.create({
  baseURL: 'https://api.ouraring.com/v2',
  headers: {
    Authorization: `Bearer ${process.env.OURA_RING_TOKEN}`,
  },
});

const dateIsoFormat = 'yyyy-MM-dd';

/**
 * Finds the most recent day's score for a type (Readiness, Sleep, Activity).
 *
 * We could sent through a single date for the range, but Activity seems to return
 * slightly different results that Readiness and Sleep (which return yesterday AND today)
 * whereas Activity has one result for yesterday.
 *
 * So perhaps you run this script twice a day to make sure you get Activity later!
 *
 * @param {String} type  One of 'readiness', 'sleep', or 'activity'
 *
 * @returns {Number}  Latest score by type
 */
async function fetchOuraScore(type: string, date: string, timeZone: string) {
  // GET https://api.ouraring.com/v2/usercollection/daily_<type>?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD

  const endDate = date;
  const startDate = formatInTimeZone(subDays(date, 1), timeZone, dateIsoFormat);

  const uri = `usercollection/daily_${type}?start_date=${startDate}&end_date=${endDate}`;

  const {
    data: { data: entries },
  } = await oura.get(uri);

  if (entries.length) {
    return Number(entries.slice(-1)[0].score);
  }
}

async function fetchOuraScores(date: string, timeZone: string) {
  return await ['readiness', 'sleep', 'activity'].reduce(async (scores, type) => {
    const score = await fetchOuraScore(type, date, timeZone);

    return {
      ...(await scores),
      [type]: score,
    };
  }, {});
}

worker.tool('fetchOuraScores', {
  title: 'Fetch Oura Scores',
  description: 'Fetches scores for Readiness, Activity, and Sleep for a given date',
  schema: j.object({
    date: j.date().nullable().describe(`The date to fetch scores for as ${dateIsoFormat}`),
  }),
  execute: async (input) => {
    // Use date-fns to format our dates. Intl API is a nightmare.
    const timeZone = process.env.OURA_TIMEZONE || 'America/Los_Angeles';
    let date = new Date();

    if (input.date) {
      date = parseISO(input.date);
    }

    const dateValue = formatInTimeZone(date, timeZone, dateIsoFormat);

    const scores = await fetchOuraScores(dateValue, timeZone);
    console.log(scores);

    return {
      date: dateValue,
      ...scores,
    };
  },
});
