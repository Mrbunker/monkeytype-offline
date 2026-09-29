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
      title="词典 Dictionary"
      modalClass="max-w-3xl"
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
      <div class="flex flex-wrap items-center gap-2">
        <Button
          text="查词"
          active={tab() === "search"}
          onClick={() => setTab("search")}
        />
        <Button
          text={`生词本 (${saved().length})`}
          active={tab() === "saved"}
          onClick={() => {
            setTab("saved");
            void refreshSaved();
          }}
        />
        <Button text="关闭" variant="text" class="ml-auto" onClick={close} />
      </div>
      <Show when={storageError()}>
        <p role="alert" class="text-sm text-error">
          {storageError()}{" "}
          <Button
            text="重试存储"
            variant="text"
            onClick={() => void refreshSaved()}
          />
        </p>
      </Show>
      <Show when={notice()}>
        <p role="status" class="text-sm">
          {notice()}
        </p>
      </Show>
      <Show when={tab() === "search"}>
        <form
          class="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void search(query());
          }}
        >
          <input
            aria-label="查询英文单词"
            class="min-w-0 flex-1"
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
          <div class="flex flex-wrap gap-2" aria-label="搜索建议">
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
          <p role="status">正在查询…</p>
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
                  <p role="status">
                    未收录 “{outcome().query}”。请检查拼写或尝试原形。
                  </p>
                }
              >
                {(entry) => (
                  <article class="grid gap-4" aria-label="单词详情">
                    <div class="flex flex-wrap items-center gap-3">
                      <h2 class="text-3xl text-main">{entry().word}</h2>
                      <Show when={entry().phonetic}>
                        <span class="text-sub">/{entry().phonetic}/</span>
                      </Show>
                    </div>
                    <Show when={outcome().query !== entry().word}>
                      <p class="text-sm">
                        {outcome().query} → 原形 {entry().word}
                      </p>
                    </Show>
                    <Show when={getLookupContext().input !== undefined}>
                      <p class="text-sm text-sub">
                        本次输入：
                        {(getLookupContext().input ?? "") === ""
                          ? "（未输入）"
                          : getLookupContext().input}{" "}
                        ·{" "}
                        {getLookupContext().input?.trim() ===
                        getLookupContext().word.trim()
                          ? "正确"
                          : "与目标词不一致"}
                        <Show when={Number.isFinite(getLookupContext().burst)}>
                          {" "}
                          · {Math.round(getLookupContext().burst ?? 0)} WPM
                        </Show>
                      </p>
                    </Show>
                    <div class="flex flex-wrap gap-2">
                      <For each={entry().tags}>
                        {(tag) => (
                          <span class="rounded bg-sub-alt px-2 py-1 text-xs">
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
                    <div class="flex flex-wrap gap-2">
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
                        onClick={() =>
                          void run(async () => {
                            await navigator.clipboard.writeText(entry().word);
                            setNotice("已复制单词。");
                          })
                        }
                      />
                    </div>
                    <Show when={entry().translation}>
                      <section>
                        <h3 class="mb-2 text-main">中文释义</h3>
                        <p class="leading-relaxed break-words whitespace-pre-line">
                          {entry().translation}
                        </p>
                      </section>
                    </Show>
                    <Show when={entry().definition}>
                      <section>
                        <h3 class="mb-2 text-main">英文释义与用例</h3>
                        <p class="leading-relaxed break-words whitespace-pre-line">
                          {entry().definition}
                        </p>
                      </section>
                    </Show>
                    <Show when={Object.keys(entry().forms).length}>
                      <section>
                        <h3 class="mb-2 text-main">词形变化</h3>
                        <div class="flex flex-wrap gap-2">
                          <For each={Object.entries(entry().forms)}>
                            {([kind, value]) => (
                              <Button
                                variant="text"
                                text={`${formLabels[kind] ?? kind}：${value}`}
                                onClick={() => void search(value)}
                              />
                            )}
                          </For>
                        </div>
                      </section>
                    </Show>
                  </article>
                )}
              </Show>
              <Show when={outcome().alternatives.length}>
                <div class="flex flex-wrap gap-2">
                  <span>相关词：</span>
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
          <div>
            <p class="mb-2 text-sub">最近查询</p>
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
        <p class="text-xs text-sub">
          英文词典 · 中英释义、音标和词形来自 ECDICT。内容以词库收录为准。
        </p>
      </Show>
      <Show when={tab() === "saved"}>
        <input
          aria-label="筛选生词"
          placeholder="筛选生词"
          value={filter()}
          onInput={(event) => setFilter(event.currentTarget.value)}
        />
        <div class="flex flex-wrap gap-2">
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
          <ul class="grid max-h-80 gap-1 overflow-auto" aria-label="生词列表">
            <For each={filtered()}>
              {(item) => (
                <li class="flex items-center gap-3 rounded bg-sub-alt px-3 py-2">
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
        <p class="text-xs text-sub">
          生词保存在当前浏览器，可通过 Local history 的 JSON
          备份迁移。练习将切换到英文自定义模式，每词重复练习，至少 10 词。
        </p>
      </Show>
    </AnimatedModal>
  );
}
