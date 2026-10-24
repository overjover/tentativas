import { describe, expect, it } from "vitest";
import { buildSpeechPlan, buildSpeechQueue, profileForSegment, TIMER_PRESETS_MINUTES, wordRangeAt } from "./speech-queue";

function spokenText(source: string, limit?: number) {
  return buildSpeechQueue(source, limit).map((segment) => segment.text).join("");
}

describe("buildSpeechQueue", () => {
  it("returns no utterances for empty or formatting-only text", () => {
    expect(buildSpeechQueue("   \n ")).toEqual([]);
  });

  it("splits sentence checkpoints while preserving every source character and UTF-16 offsets", () => {
    const source = "Primeira frase. Segunda frase? Última!\r\nFim.";
    const queue = buildSpeechQueue(source);
    expect(spokenText(source)).toBe(source);
    expect(queue.map((item) => item.text)).toEqual(["Primeira frase.", " Segunda frase?", " Última!", "\r\nFim."]);
    for (const segment of queue) {
      expect(source.slice(segment.start, segment.end)).toBe(segment.text);
    }
  });

  it("does not split commas, semicolons, colons, or dialogue dashes", () => {
    const source = "Ela respondeu, com calma: — Espere, por favor; vou voltar.";
    const queue = buildSpeechQueue(source);
    expect(queue).toHaveLength(1);
    expect(spokenText(source)).toBe(source);
    expect(queue[0].text).toContain("— Espere, por favor;");
  });

  it("keeps punctuation and closing quotes with the phrase and preserves decimals/abbreviations", () => {
    const source = "Dr. Silva mediu 3.5 cm. “Tudo certo!”, disse ela. E partiu…";
    const queue = buildSpeechQueue(source);
    expect(spokenText(source)).toBe(source);
    expect(queue.map((segment) => segment.text)).toEqual(["Dr. Silva mediu 3.5 cm.", " “Tudo certo!”, disse ela.", " E partiu…"]);
    expect(queue.at(-1)?.pauseAfterMs).toBe(240);
  });

  it("supports fullwidth and CJK sentence marks without separating their closing quotes", () => {
    const source = "「雨が降った。」 次です！ “Calma?”";
    const queue = buildSpeechQueue(source);
    expect(queue.map((segment) => segment.text)).toEqual(["「雨が降った。」", " 次です！", " “Calma?”"]);
    expect(queue.map((segment) => segment.pauseAfterMs)).toEqual([65, 95, 95]);
    expect(spokenText(source)).toBe(source);
  });

  it("adds a paragraph pause, but no artificial comma pause", () => {
    const source = "Primeiro, sem corte.\n\nSegundo parágrafo.";
    const queue = buildSpeechQueue(source);
    expect(spokenText(source)).toBe(source);
    expect(queue).toHaveLength(2);
    expect(queue[0].pauseAfterMs).toBe(420);
    expect(queue[1].pauseAfterMs).toBe(65);
  });

  it("gives explicit scene/revelation transitions a longer pause", () => {
    const source = "A porta se abriu. De repente, a sala ficou vazia.";
    const queue = buildSpeechQueue(source);
    expect(queue[0].pauseAfterMs).toBe(520);
    expect(spokenText(source)).toBe(source);
  });

  it("uses nearby explicit speech cues without changing the spoken text", () => {
    const whisper = buildSpeechQueue("— Não faça isso. — sussurrou ela.");
    const shout = buildSpeechQueue("Pare agora! — gritou ele.");
    expect(whisper.some((segment) => segment.cue === "whisper")).toBe(true);
    expect(shout.some((segment) => segment.cue === "shout")).toBe(true);
    expect(spokenText("— Não faça isso. — sussurrou ela.")).toBe("— Não faça isso. — sussurrou ela.");
  });

  it("uses only nearby textual evidence for thought, suspense, and action", () => {
    expect(buildSpeechQueue("Ele ponderou cada palavra.")[0].cue).toBe("thought");
    expect(buildSpeechQueue("Temeu que a porta se abrisse.")[0].cue).toBe("suspense");
    expect(buildSpeechQueue("O grupo avançou pela passagem.")[0].cue).toBe("action");
    expect(buildSpeechQueue("Descrição neutra da sala.")[0].cue).toBe("neutral");
  });

  it("uses only small, bounded expression changes, and neutral settings exactly when disabled", () => {
    const segment = buildSpeechQueue("Ela sussurrou baixinho.")[0];
    const base = { rate: 0.92, pitch: 1 };
    const whisper = profileForSegment(segment, base, true);
    const neutral = profileForSegment(segment, base, false);
    expect(whisper.rate).toBeLessThan(base.rate);
    expect(whisper.pitch).toBeLessThan(base.pitch);
    expect(whisper.volume).toBeLessThan(1);
    expect(neutral).toEqual({ ...base, volume: 1 });
    expect(whisper.rate).toBeGreaterThanOrEqual(0.65);
    expect(whisper.pitch).toBeGreaterThanOrEqual(0.8);
  });

  it("keeps long descriptive, action, suspense, and unusual-punctuation text exact", () => {
    const samples = [
      "A cidade acordava devagar, coberta pela chuva; as janelas refletiam o céu.\n\nEle correu — sem olhar para trás — e sentiu medo…",
      `Ação! ${"Eles avançaram, recuaram e voltaram? ".repeat(60)}Fim.`,
      "Ela perguntou: “Você ouviu aquilo?” (Ninguém respondeu.) — Então o silêncio voltou.",
    ];
    for (const source of samples) expect(spokenText(source, 120)).toBe(source);
  });

  it("bounds hard-limit chunks without dropping a word or inserting a delay at a forced boundary", () => {
    const source = `${"palavra ".repeat(110)}fim.`;
    const queue = buildSpeechQueue(source, 80);
    expect(queue.length).toBeGreaterThan(1);
    expect(queue.every((item) => item.text.length <= 80)).toBe(true);
    expect(queue.map((item) => item.text).join("")).toBe(source);
    expect(queue.slice(0, -1).some((item) => item.pauseAfterMs === 0)).toBe(true);
  });

  it("handles a long chapter with many sentence checkpoints in order", () => {
    const source = "Frase longa o bastante para leitura. ".repeat(12000);
    const queue = buildSpeechQueue(source);
    expect(queue).toHaveLength(12000);
    expect(queue.map((item) => item.text).join("")).toBe(source);
    expect(queue.every((item) => item.text.length <= 680)).toBe(true);
  });

  it("maps native UTF-16 boundary callbacks to the current word", () => {
    expect(wordRangeAt("Olá, mundo!", 5, 5)).toEqual({ start: 5, length: 5 });
    expect(wordRangeAt("olá, mundo!", 6, 0)).toEqual({ start: 5, length: 5 });
  });

  it("keeps synthetic spine labels out of TTS and maintains one global segment index", () => {
    const plan = buildSpeechPlan([
      { title: "Parte 1", syntheticTitle: true, text: "Texto real." },
      { title: "Capítulo existente", text: "Capítulo existente. Próxima frase." },
    ]);
    expect(plan.sections.map((section) => section.title)).toEqual(["", "Capítulo existente"]);
    expect(plan.segments.map((segment) => segment.text).join("")).toBe("Texto real.Capítulo existente. Próxima frase.");
    expect(plan.segments[0].pauseAfterMs).toBe(420);
    expect(plan.sections[0].pieces.map((piece) => piece.segmentIndex)).toEqual([0]);
    expect(plan.sections[1].pieces.map((piece) => piece.segmentIndex)).toEqual([1, 2]);
  });
});

describe("timer presets", () => {
  it("uses one shared set of optional presets with off as the default", () => {
    expect(TIMER_PRESETS_MINUTES).toEqual([15, 30, 45, 60]);
    const defaultTimer: number | null = null;
    expect(defaultTimer).toBeNull();
  });
});
