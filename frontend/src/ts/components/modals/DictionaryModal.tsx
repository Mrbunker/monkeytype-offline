import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
} from "solid-js";
import { z } from "zod";

import { setConfig } from "../../config/setters";
import {
  normalizeWord,
  WordSchema,
  type VocabularyEntry,
} from "../../dictionary/schema";
import {
  lookupWord,
  suggestWords,
  type LookupResult,
} from "../../dictionary/service";
import { getLookupContext, setLookupContext } from "../../dictionary/state";
import { navigationEvent } from "../../events/navigation";
import { restartTestEvent } from "../../events/test";
import {
  readVocabulary,
  saveVocabulary,
  deleteVocabulary,
} from "../../offline/storage";
import { getActivePage, setCustomTextIndicator } from "../../states/core";
import { hideModalAndClearChain, isModalOpen } from "../../states/modals";
import { isTestActive, setLoadedChallenge } from "../../states/test";
import * as CustomText from "../../test/custom-text";
import { LocalStorageWithSchema } from "../../utils/local-storage-with-schema";
import { AnimatedModal } from "../common/AnimatedModal";
import { Button } from "../common/Button";

const recentStorage = new LocalStorageWithSchema({
  key: "dictionaryRecent",
  schema: z.array(WordSchema).max(20),
  fallback: [],
});
const formLabels: Record<string, string> = {
  p: "过去式",
  d: "过去分词",
  i: "现在分词",
  "3": "第三人称单数",
  r: "比较级",
  s: "最高级",
  n: "复数",
  "0": "原形",
};
const tagLabels: Record<string, string> = {
  zk: "中考",
  gk: "高考",
  cet4: "四级",
  cet6: "六级",
  ky: "考研",
  toefl: "托福",
  ielts: "雅思",
  gre: "GRE",
};

export function DictionaryModal() {
  const [tab, setTab] = createSignal<"search" | "saved">("search");
  const [query, setQuery] = createSignal("");
  const [result, setResult] = createSignal<LookupResult>();
  const [suggestions, setSuggestions] = createSignal<string[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [storageError, setStorageError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [saved, setSaved] = createSignal<VocabularyEntry[]>([]);
  const [recent, setRecent] = createSignal<string[]>([]);
  const [filter, setFilter] = createSignal("");
  const [selected, setSelected] = createSignal<string[]>([]);
  const [notice, setNotice] = createSignal("");
  const filtered = createMemo(() =>
    saved().filter((item) => item.word.includes(filter().trim().toLowerCase())),
  );
  let request = 0;
  let opener: HTMLElement | null = null;

  const refreshSaved = async (): Promise<void> => {
    try {
      setSaved(await readVocabulary());
      setStorageError("");
    } catch {
      setStorageError(
        "无法读取生词本，请检查浏览器存储权限后重试。查词仍可使用。",
      );
    }
  };
  const run = async (action: () => Promise<void>): Promise<void> => {
    if (busy()) return;
    setBusy(true);
    setNotice("");
    try {
      await action();
      await refreshSaved();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "操作失败，请重试。");
    } finally {
      setBusy(false);
    }
  };
  const search = async (word: string, keepContext = false): Promise<void> => {
    const id = ++request;
    setTab("search");
    setQuery(word);
    setResult(undefined);
    setSuggestions([]);
    setError("");
    setNotice("");
    if (!keepContext) setLookupContext({ word });
    if (!WordSchema.safeParse(normalizeWord(word)).success) {
      setLoading(false);
      setError("请输入一个英文单词，可包含连字符或撇号。");
      return;
    }
    setLoading(true);
    try {
      const value = await lookupWord(word);
      if (id !== request || !isModalOpen("Dictionary")) return;
      setResult(value);
      if (value.entry) {
        const next = [
          value.query,
          ...recent().filter((item) => item !== value.query),
        ].slice(0, 20);
        setRecent(next);
        recentStorage.set(next);
      }
    } catch {
      if (id === request) setError("词典加载失败，请确认站点资源可用后重试。");
    } finally {
      if (id === request) setLoading(false);
    }
  };

  createEffect(() => {
    const text = query();
    if (
      !isModalOpen("Dictionary") ||
      tab() !== "search" ||
      loading() ||
      result()?.query === normalizeWord(text)
    ) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void suggestWords(text)
        .then((words) => {
          if (!cancelled) setSuggestions(words);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 220);
    onCleanup(() => {
      cancelled = true;
      clearTimeout(timer);
    });
  });

  const practice = (words: string[]): void => {
    if (!words.length || isTestActive()) return;
    setLoadedChallenge(null);
    setConfig("mode", "custom");
    setConfig("language", "english");
    CustomText.setPipeDelimiter(false);
    CustomText.setText(words);
    CustomText.setMode("repeat");
    CustomText.setLimitMode("word");
    CustomText.setLimitValue(Math.max(10, words.length * 3));
    setCustomTextIndicator({ name: "vocabulary", isLong: false });
    hideModalAndClearChain("Dictionary");
    if (getActivePage() === "test") {
      restartTestEvent.dispatch();
    } else {
      navigationEvent.dispatch({
        url: `${import.meta.env.BASE_URL}#/`,
        options: {},
      });
    }
  };
  const close = (): void => hideModalAndClearChain("Dictionary");

  return (
    <AnimatedModal
      id="Dictionary"
      modalClass="max-w-4xl gap-0 overflow-hidden p-0 sm:p-0"
      wrapperClass="p-3 sm:p-8"
      focusFirstInput
      beforeShow={() => {
        opener =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        setTab("search");
        setQuery(getLookupContext().word);
        setResult(undefined);
        setError("");
        setNotice("");
        setSelected([]);
        setFilter("");
        setSuggestions([]);
        setRecent(recentStorage.get());
        void refreshSaved();
        const context = getLookupContext();
        if (
          context.language !== undefined &&
          !context.language.startsWith("english")
        ) {
          setError("当前词典仅支持英文。可在上方手动输入英文单词查询。");
        } else if (context.word) {
          void search(context.word, true);
        }
      }}
      beforeHide={() => {
        request++;
        setLoading(false);
      }}
      afterHide={() => {
        if (opener?.isConnected) opener.focus({ preventScroll: true });
      }}
    >
      <header class="flex items-center gap-4 border-b border-sub-alt px-5 py-4 sm:px-7">
        <div>
          <h2 class="text-xl text-main sm:text-2xl">词典</h2>
          <p class="mt-1 text-xs text-sub">离线查词与生词练习</p>
        </div>
        <Button
          text="关闭"
          aria-label="关闭"
          fa={{ icon: "fa-times" }}
          variant="text"
          class="ml-auto text-lg"
          onClick={close}
        />
      </header>
      <nav
        class="flex gap-1 border-b border-sub-alt bg-sub-alt px-5 py-2 sm:px-7"
        aria-label="词典功能"
      >
        <Button
          text="查词"
          active={tab() === "search"}
          class="min-w-20"
          onClick={() => setTab("search")}
        />
        <Button
          text={`生词本 (${saved().length})`}
          active={tab() === "saved"}
          class="min-w-28"
          onClick={() => {
            setTab("saved");
            void refreshSaved();
          }}
        />
      </nav>
      <div class="grid gap-5 overflow-auto px-5 py-5 sm:px-7 sm:py-6">
        <Show when={storageError()}>
          <div
            role="alert"
            class="flex flex-wrap items-center gap-2 rounded bg-sub-alt px-4 py-3 text-sm text-error"
          >
            <span class="min-w-0 flex-1">{storageError()}</span>
            <Button
              text="重试存储"
              variant="text"
              onClick={() => void refreshSaved()}
            />
          </div>
        </Show>
        <Show when={notice()}>
          <p role="status" class="rounded bg-sub-alt px-4 py-3 text-sm">
            {notice()}
          </p>
        </Show>
        <Show when={tab() === "search"}>
          <form
            class="flex gap-2 rounded bg-sub-alt p-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              void search(query());
            }}
          >
            <input
              aria-label="查询英文单词"
              class="min-w-0 flex-1 bg-transparent px-2"
              maxLength={80}
              placeholder="输入英文单词，例如 curious"
              value={query()}
              onInput={(event) => {
                request++;
                setLoading(false);
                setResult(undefined);
                setSuggestions([]);
                setQuery(event.currentTarget.value);
              }}
            />
            <Button
              type="submit"
              text="查询"
              disabled={loading() || !query().trim()}
            />
          </form>
          <Show when={suggestions().length}>
            <div
              class="-mt-3 flex flex-wrap items-center gap-1"
              aria-label="搜索建议"
            >
              <span class="mr-1 text-xs text-sub">猜你想查</span>
              <For each={suggestions()}>
                {(word) => (
                  <Button
                    text={word}
                    variant="text"
                    onClick={() => void search(word)}
                  />
                )}
              </For>
            </div>
          </Show>
          <Show when={loading()}>
            <p role="status" class="py-8 text-center text-sub">
              正在查询…
            </p>
          </Show>
          <Show when={error()}>
            <p role="alert" class="text-error">
              {error()}{" "}
              <Button
                text="重试查询"
                variant="text"
                onClick={() => void search(query())}
              />
            </p>
          </Show>
          <Show when={!loading() && result()}>
            {(outcome) => (
              <>
                <Show
                  when={outcome().entry}
                  fallback={
                    <p
                      role="status"
                      class="rounded bg-sub-alt px-4 py-8 text-center"
                    >
                      未收录 “{outcome().query}”。请检查拼写或尝试原形。
                    </p>
                  }
                >
                  {(entry) => (
                    <article class="grid gap-5" aria-label="单词详情">
                      <section class="rounded bg-sub-alt p-4 sm:p-5">
                        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <h2 class="text-3xl text-main sm:text-4xl">
                            {entry().word}
                          </h2>
                          <Show when={entry().phonetic}>
                            <span class="text-sub">/{entry().phonetic}/</span>
                          </Show>
                        </div>
                        <Show when={outcome().query !== entry().word}>
                          <p class="mt-2 text-sm text-sub">
                            查询词 {outcome().query} · 原形 {entry().word}
                          </p>
                        </Show>
                        <div class="mt-3 flex flex-wrap items-center gap-2">
                          <For each={entry().tags}>
                            {(tag) => (
                              <span class="rounded bg-bg px-2 py-1 text-xs text-sub">
                                {tagLabels[tag] ?? tag}
                              </span>
                            )}
                          </For>
                          <Show when={entry().frequency > 0}>
                            <span class="text-xs text-sub">
                              词频排名 {entry().frequency}
                            </span>
                          </Show>
                        </div>
                        <Show when={getLookupContext().input !== undefined}>
                          <p class="mt-3 border-t border-bg pt-3 text-sm text-sub">
                            本次输入：
                            {(getLookupContext().input ?? "") === ""
                              ? "（未输入）"
                              : getLookupContext().input}{" "}
                            ·{" "}
                            {getLookupContext().input?.trim() ===
                            getLookupContext().word.trim()
                              ? "正确"
                              : "与目标词不一致"}
                            <Show
                              when={Number.isFinite(getLookupContext().burst)}
                            >
                              {" "}
                              · {Math.round(getLookupContext().burst ?? 0)} WPM
                            </Show>
                          </p>
                        </Show>
                      </section>
                      <div class="flex flex-wrap gap-2 border-b border-sub-alt pb-5">
                        <Button
                          aria-label={
                            saved().some((item) => item.word === entry().word)
                              ? "取消收藏"
                              : "收藏生词"
                          }
                          text={
                            saved().some((item) => item.word === entry().word)
                              ? "取消收藏"
                              : "收藏生词"
                          }
                          fa={{ icon: "fa-star" }}
                          disabled={busy() || !!storageError()}
                          onClick={() => {
                            const word = entry().word;
                            const exists = saved().some(
                              (item) => item.word === word,
                            );
                            void run(async () => {
                              if (exists) {
                                await deleteVocabulary([word]);
                              } else {
                                await saveVocabulary({
                                  word,
                                  language: "english",
                                  createdAt: Date.now(),
                                });
                              }
                            });
                          }}
                        />
                        <Button
                          text="练习这个词"
                          onClick={() => practice([entry().word])}
                        />
                        <Button
                          text="复制单词"
                          variant="text"
                          class="sm:ml-auto"
                          onClick={() =>
                            void run(async () => {
                              await navigator.clipboard.writeText(entry().word);
                              setNotice("已复制单词。");
                            })
                          }
                        />
                      </div>
                      <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(14rem,0.45fr)]">
                        <div class="grid content-start gap-4">
                          <Show when={entry().translation}>
                            <section class="rounded bg-sub-alt p-4">
                              <h3 class="mb-3 text-sm text-main">中文释义</h3>
                              <p class="leading-relaxed break-words whitespace-pre-line">
                                {entry().translation}
                              </p>
                            </section>
                          </Show>
                          <Show when={entry().definition}>
                            <section class="rounded bg-sub-alt p-4">
                              <h3 class="mb-3 text-sm text-main">
                                英文释义与用例
                              </h3>
                              <p class="leading-relaxed break-words whitespace-pre-line">
                                {entry().definition}
                              </p>
                            </section>
                          </Show>
                        </div>
                        <Show when={Object.keys(entry().forms).length}>
                          <section class="rounded bg-sub-alt p-4">
                            <h3 class="mb-3 text-sm text-main">词形变化</h3>
                            <div class="grid gap-1">
                              <For each={Object.entries(entry().forms)}>
                                {([kind, value]) => (
                                  <Button
                                    variant="text"
                                    class="w-full justify-between text-left"
                                    text={`${formLabels[kind] ?? kind}：${value}`}
                                    onClick={() => void search(value)}
                                  />
                                )}
                              </For>
                            </div>
                          </section>
                        </Show>
                      </div>
                    </article>
                  )}
                </Show>
                <Show when={outcome().alternatives.length}>
                  <div class="flex flex-wrap items-center gap-1 border-t border-sub-alt pt-4">
                    <span class="mr-1 text-sm text-sub">相关词</span>
                    <For each={outcome().alternatives}>
                      {(word) => (
                        <Button
                          text={word}
                          variant="text"
                          onClick={() => void search(word)}
                        />
                      )}
                    </For>
                  </div>
                </Show>
              </>
            )}
          </Show>
          <Show when={!query() && recent().length}>
            <div class="rounded bg-sub-alt p-4">
              <p class="mb-2 text-sm text-sub">最近查询</p>
              <div class="flex flex-wrap gap-2">
                <For each={recent()}>
                  {(word) => (
                    <Button
                      text={word}
                      variant="text"
                      onClick={() => void search(word)}
                    />
                  )}
                </For>
              </div>
            </div>
          </Show>
          <p class="border-t border-sub-alt pt-4 text-xs text-sub">
            英文词典 · 中英释义、音标和词形来自 ECDICT。内容以词库收录为准。
          </p>
        </Show>
        <Show when={tab() === "saved"}>
          <input
            aria-label="筛选生词"
            class="w-full"
            placeholder="输入单词筛选生词"
            value={filter()}
            onInput={(event) => setFilter(event.currentTarget.value)}
          />
          <div class="flex flex-wrap gap-2 rounded bg-sub-alt p-3">
            <Button
              text="全选当前列表"
              disabled={!filtered().length}
              onClick={() => setSelected(filtered().map((item) => item.word))}
            />
            <Button
              text={`练习选中 (${selected().length})`}
              disabled={!selected().length}
              onClick={() => practice(selected())}
            />
            <Button
              text="移除选中"
              disabled={busy() || !selected().length}
              onClick={() => {
                const words = selected();
                void run(async () => {
                  await deleteVocabulary(words);
                  setSelected([]);
                });
              }}
            />
          </div>
          <Show
            when={filtered().length}
            fallback={<p>暂无生词。查词后点击“收藏生词”即可加入。</p>}
          >
            <ul class="grid max-h-96 gap-2 overflow-auto" aria-label="生词列表">
              <For each={filtered()}>
                {(item) => (
                  <li class="flex items-center gap-3 rounded bg-sub-alt px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`选择 ${item.word}`}
                      checked={selected().includes(item.word)}
                      onChange={(event) =>
                        setSelected((words) =>
                          event.currentTarget.checked
                            ? [...words, item.word]
                            : words.filter((word) => word !== item.word),
                        )
                      }
                    />
                    <Button
                      text={item.word}
                      variant="text"
                      onClick={() => void search(item.word)}
                    />
                    <span class="ml-auto text-xs text-sub">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <p class="border-t border-sub-alt pt-4 text-xs text-sub">
            生词保存在当前浏览器，可通过 Local history 的 JSON
            备份迁移。练习将切换到英文自定义模式，每词重复练习，至少 10 词。
          </p>
        </Show>
      </div>
    </AnimatedModal>
  );
}
