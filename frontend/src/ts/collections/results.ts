import { getLocalResults } from "../offline/state";
import { LocalResult } from "../offline/results";
import { Difficulty, Mode, Mode2 } from "@monkeytype/schemas/shared";
import { ResultFilters } from "@monkeytype/schemas/users";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import {
  avg,
  BTreeIndex,
  count,
  createCollection,
  eq,
  gte,
  inArray,
  length,
  max,
  not,
  or,
  Query,
  queryOnce,
  sum,
  useLiveQuery,
} from "@tanstack/solid-db";
import { queryOptions } from "@tanstack/solid-query";
import { Accessor, createMemo } from "solid-js";
import { PracticeResult } from "../offline/types";
import { createEffectOn } from "../hooks/effects";
import { queryClient } from "../queries";
import { baseKey } from "../queries/utils/keys";
import { setLastResult } from "../offline/stats";
import { getConfig } from "../config/store";
import { getMode2 } from "../utils/misc";
import { getCurrentQuote } from "../states/test";
import { removeLanguageSize } from "../utils/strings";

export type ResultsQueryState = {
  difficulty: PracticeResult["difficulty"][];
  pb: PracticeResult["isPb"][];
  mode: PracticeResult["mode"][];
  words: ("10" | "25" | "50" | "100" | "custom")[];
  time: ("15" | "30" | "60" | "120" | "custom")[];
  punctuation: PracticeResult["punctuation"][];
  numbers: PracticeResult["numbers"][];
  timestamp: PracticeResult["timestamp"];
  quoteLength: PracticeResult["quoteLength"][];
  tags: PracticeResult["tags"];
  funbox: PracticeResult["funbox"];
  language: PracticeResult["language"][];
};

const queryKeys = {
  root: () => [...baseKey("results", { isUserSpecific: true })],
  fullResult: (_id: string) => [...queryKeys.root(), _id],
};

export type ResultStats = {
  words: number;
  restarted: number;
  completed: number;
  maxWpm: number;
  avgWpm: number;
  maxRaw: number;
  avgRaw: number;
  maxAcc: number;
  avgAcc: number;
  maxConsistency: number;
  avgConsistency: number;
  timeTyping: number;
  dayTimestamp?: number;
};

/**
 * get aggregated statistics for the current result selection
 * @param queryState
 * @param options
 * @returns
 */
// oxlint-disable-next-line typescript/explicit-function-return-type
export function useResultStatsLiveQuery(
  queryState: Accessor<ResultsQueryState | undefined>,
  options?: { lastTen?: true } | { groupByDay?: true },
) {
  return useLiveQuery((q) => {
    const state = queryState();
    if (state === undefined) return undefined;

    const isLastTen =
      options !== undefined && "lastTen" in options && options.lastTen;
    const isGroupByDay =
      options !== undefined && "groupByDay" in options && options.groupByDay;

    let query = isLastTen
      ? //for lastTen we need a sub-query to apply the sort+limit first and then run the aggregations
        q.from({
          r: q
            .from({ r: buildResultsQuery(state) })
            .orderBy(({ r }) => r.timestamp, "desc")
            .limit(10),
        })
      : q.from({ r: buildResultsQuery(state) });

    if (isGroupByDay) {
      query = query.groupBy(({ r }) => r.dayTimestamp);
    }

    return query.select(({ r }) => ({
      dayTimestamp: isGroupByDay ? r.dayTimestamp : undefined,
      words: sum(r.words),
      completed: count(r._id),
      restarted: sum(r.restartCount),
      timeTyping: sum(r.timeTyping),
      maxWpm: max(r.wpm),
      avgWpm: avg(r.wpm),
      maxRaw: max(r.rawWpm),
      avgRaw: avg(r.rawWpm),
      maxAcc: max(r.acc),
      avgAcc: avg(r.acc),
      maxConsistency: max(r.consistency),
      avgConsistency: avg(r.consistency),
    }));
  });
}

// oxlint-disable-next-line typescript/explicit-function-return-type
export async function getResultsQueryOnce(options: {
  queryState: Accessor<ResultsQueryState | undefined>;
  sorting: Accessor<{
    field: keyof PracticeResult;
    direction: "asc" | "desc";
  }>;
}) {
  const state = options.queryState();
  if (!state) return undefined;

  const sorting = options.sorting();

  return queryOnce((q) =>
    q
      .from({ r: buildResultsQuery(state) })
      .orderBy(({ r }) => r[sorting.field], sorting.direction),
  );
}

/**
 * get list of PracticeResults for the current result selection
 * @param queryState
 * @returns
 */
// oxlint-disable-next-line typescript/explicit-function-return-type
export function useResultsLiveQuery(options: {
  queryState: Accessor<ResultsQueryState | undefined>;
  sorting: Accessor<{
    field: keyof PracticeResult;
    direction: "asc" | "desc";
  }>;
  limit: Accessor<number>;
}) {
  return useLiveQuery((q) => {
    const state = options.queryState();
    const sorting = options.sorting();
    const limit = options.limit();
    if (state === undefined) return undefined;

    return q
      .from({ r: buildResultsQuery(state) })
      .orderBy(({ r }) => r[sorting.field], sorting.direction)
      .limit(limit);
  });
}

function normalizeResult(result: LocalResult): PracticeResult {
  const resultDate = new Date(result.timestamp);
  resultDate.setHours(0, 0, 0, 0);
  return {
    ...result,
    timeTyping: result.testDuration + result.incompleteTestSeconds,
    words: Math.round((result.wpm / 60) * result.testDuration),
    dayTimestamp: resultDate.getTime(),
  };
}

const resultsCollection = createCollection(
  queryCollectionOptions({
    staleTime: Infinity,
    gcTime: Infinity, //remove when __nonReactive is removed
    queryKey: queryKeys.root(),
    enabled: true,
    queryFn: async () => {
      const results = getLocalResults().map(toPracticeResult);

      if (results.length > 0) {
        const lastResult = results.reduce((acc, cur) =>
          acc === undefined || acc.timestamp < cur.timestamp ? cur : acc,
        );
        setLastResult(lastResult);
      } else {
        setLastResult(undefined);
      }
      return results;
    },
    queryClient,
    getKey: (it) => it._id,
  }),
);

resultsCollection.createIndex((row) => row.timestamp, {
  indexType: BTreeIndex,
});

// oxlint-disable-next-line typescript/explicit-function-return-type
export function buildResultsQuery(state: ResultsQueryState) {
  const applyMode2Filter = <T extends "time" | "words">(
    key: T,
    filter: ResultsQueryState[T],
    nonCustomValues: string[],
  ): void => {
    if (filter.length === 5) return;
    const isCustom = filter.includes("custom");
    const selected = filter.filter((it) => it !== "custom");
    query = query.where(({ r }) =>
      or(
        //results not matching the mode pass
        not(eq(r.mode, key)),

        //mode2 is matching one of the  selected mode2
        inArray(r.mode2, selected),
        //or if custom selected are not matching any non-custom value
        isCustom ? not(inArray(r.mode2, nonCustomValues)) : false,
      ),
    );
  };

  let query = new Query()
    .from({ r: resultsCollection })
    .where(({ r }) => gte(r.timestamp, state.timestamp))
    .where(({ r }) => inArray(r.difficulty, state.difficulty))
    .where(({ r }) => inArray(r.isPb, state.pb))
    .where(({ r }) => inArray(r.mode, state.mode))
    .where(({ r }) => inArray(r.punctuation, state.punctuation))
    .where(({ r }) => inArray(r.numbers, state.numbers))
    .where(({ r }) => inArray(r.quoteLength, state.quoteLength))
    .where(({ r }) => inArray(r.language, state.language))
    .where(({ r }) =>
      or(
        false,
        false,
        ...state.tags.map((tag) =>
          tag === "none" ? eq(length(r.tags), 0) : inArray(tag, r.tags),
        ),
      ),
    )
    .where(({ r }) =>
      or(
        false,
        false,
        ...state.funbox.map((fb) =>
          (fb as string) === "none"
            ? eq(length(r.funbox), 0)
            : inArray(fb, r.funbox),
        ),
      ),
    );
  applyMode2Filter("time", state.time, ["15", "30", "60", "120"]);
  applyMode2Filter("words", state.words, ["10", "25", "50", "100"]);

  return query;
}

export function createResultsQueryState(
  filters: ResultFilters,
): ResultsQueryState {
  return {
    difficulty: valueFilter(filters.difficulty),
    pb: boolFilter(filters.pb),
    mode: valueFilter(filters.mode),
    words: valueFilter(filters.words),
    time: valueFilter(filters.time),
    punctuation: boolFilter(filters.punctuation),
    numbers: boolFilter(filters.numbers),
    timestamp: timestampFilter(filters.date),
    quoteLength: [
      ...valueFilter(filters.quoteLength, {
        short: 0,
        medium: 1,
        long: 2,
        thicc: 3,
      }),
      -1, // fallback value for results without quoteLength, set in the collection
    ],
    tags: valueFilter(filters.tags),
    funbox: valueFilter(filters.funbox),
    language: valueFilter(filters.language),
  };
}

function valueFilter<T extends string, U = T>(
  val: Partial<Record<T, boolean>>,
  mapping?: Record<T, U>,
): U[] {
  return Object.entries(val)
    .filter(([_, v]) => v === true)
    .map(([k]) => k as T)
    .map((it) => (mapping ? mapping[it] : (it as unknown as U)));
}

function boolFilter(
  val: Record<"on" | "off", boolean> | Record<"yes" | "no", boolean>,
): boolean[] {
  return Object.entries(val)
    .filter(([_, v]) => v)
    .map(([k]) => k === "on" || k === "yes");
}

function timestampFilter(val: ResultFilters["date"]): number {
  const seconds =
    valueFilter(val, {
      all: 0,
      last_day: 24 * 60 * 60,
      last_week: 7 * 24 * 60 * 60,
      last_month: 30 * 24 * 60 * 60,
      last_3months: 90 * 24 * 60 * 60,
    })[0] ?? 0;

  if (seconds === 0) return 0;
  return Math.floor(Date.now() - seconds * 1000);
}

// oxlint-disable-next-line typescript/explicit-function-return-type
export const getSingleResultQueryOptions = (_id: string) =>
  queryOptions({
    queryKey: queryKeys.fullResult(_id),
    queryFn: async () => {
      const result = getLocalResults().find((item) => item._id === _id);
      if (result === undefined) throw new Error("Local result not found");
      return toPracticeResult(result);
    },
    staleTime: Infinity,
  });

export type CurrentSettingsFilter = {
  mode: Mode;
  mode2: Mode2<Mode>;
  punctuation: boolean;
  numbers: boolean;
  language: string;
  difficulty: Difficulty;
  lazyMode: boolean;
};

// oxlint-disable-next-line typescript/explicit-function-return-type
export function useUserAverage10LiveQuery(options: {
  isEnabled: Accessor<boolean>;
}) {
  const settingsFilter = createMemo(() => {
    const language =
      getConfig.mode === "quote"
        ? removeLanguageSize(getConfig.language)
        : getConfig.language;

    return {
      ...getConfig,
      mode2: getMode2(getConfig, getCurrentQuote()),
      language,
    };
  });

  return useLiveQuery((q) => {
    //disable query
    if (!options.isEnabled()) return undefined;

    return q
      .from({
        //we use sub-query to filter first and then aggregate
        last10: buildSettingsResultsQuery(settingsFilter())
          .orderBy(({ r }) => r.timestamp, "desc")
          .limit(10),
      })
      .select(({ last10 }) => ({ wpm: avg(last10.wpm), acc: avg(last10.acc) }))
      .findOne();
  });
}

export async function getUserAverage10Once(
  options: CurrentSettingsFilter,
): Promise<{ wpm: number; acc: number }> {
  //exit early if there is no user. Don't init the result collection

  const result = await queryOnce((q) =>
    q
      .from({
        //we use sub-query to filter first and then aggregate
        last10: buildSettingsResultsQuery(options)
          .orderBy(({ r }) => r.timestamp, "desc")
          .limit(10),
      })
      .select(({ last10 }) => ({ wpm: avg(last10.wpm), acc: avg(last10.acc) }))
      .findOne(),
  );

  return result ?? { wpm: 0, acc: 0 };
}

export async function getUserDailyBestOnce(
  options: CurrentSettingsFilter,
): Promise<{ wpm: number; acc: number }> {
  //exit early if there is no user. Don't init the result collection

  const result = await queryOnce(() =>
    buildSettingsResultsQuery(options)
      .where(({ r }) => gte(r.timestamp, Date.now() - 24 * 60 * 60 * 1000))
      .orderBy(({ r }) => r.wpm, "desc")
      .limit(1)
      .findOne(),
  );

  return result ?? { wpm: 0, acc: 0 };
}

// oxlint-disable-next-line typescript/explicit-function-return-type
function buildSettingsResultsQuery(
  filter: CurrentSettingsFilter,
  options?: { tagIds?: string[] },
) {
  const tagIds = options?.tagIds;

  let query = new Query()
    .from({ r: resultsCollection })
    .where(({ r }) => eq(r.mode, filter.mode))
    .where(({ r }) => eq(r.mode2, filter.mode2))
    .where(({ r }) => eq(r.punctuation, filter.punctuation))
    .where(({ r }) => eq(r.numbers, filter.numbers))
    .where(({ r }) => eq(r.language, filter.language))
    .where(({ r }) => eq(r.difficulty, filter.difficulty))
    .where(({ r }) => eq(r.lazyMode, filter.lazyMode));

  if (tagIds !== undefined) {
    query = query.where(({ r }) =>
      or(
        false,
        tagIds.length === 0,
        ...tagIds.map((it) => inArray(it, r.tags)),
      ),
    );
  }

  return query;
}

export function isResultsReady(): boolean {
  return resultsCollection.isReady();
}

export async function waitForResultsReady(): Promise<void> {
  await resultsCollection.stateWhenReady();
}

/**
 *
 */
createEffectOn(getLocalResults, () => {
  void resultsCollection.utils.refetch();
});

function getResults(): PracticeResult[] {
  return [...resultsCollection.values()];
}
/**
 * Used for non reactive access. Do not use in Solid components.
 */
export const __nonReactive = {
  getResults,
};

export function toPracticeResult(result: LocalResult): PracticeResult {
  return normalizeResult(result);
}
