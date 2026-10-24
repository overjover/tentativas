import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { SpeechSegment, SpeechVisiblePiece } from "@/lib/reader/speech-queue";

const C = { cyan: "#12ddff", text: "#e4dfd1", active: "#201a36", word: "#12ddff", bg: "#060914" };
const RUN_SIZE = 48;

type Props = {
  title: string;
  pieces: SpeechVisiblePiece[];
  segments: SpeechSegment[];
  activeSegmentIndex: number;
  currentCharStart: number;
  currentCharLength: number;
  fontSize: number;
};
type RunProps = Pick<Props, "segments" | "currentCharStart" | "currentCharLength"> & {
  pieces: SpeechVisiblePiece[];
  activeSegmentIndex: number;
};

const SpeechTextRun = memo(function SpeechTextRun({ pieces, segments, activeSegmentIndex, currentCharStart, currentCharLength }: RunProps) {
  return (
    <Text>
      {pieces.map((piece) => {
        const segment = segments[piece.segmentIndex];
        if (!segment) return null;
        const source = segment.text.slice(piece.segmentOffset, piece.segmentOffset + piece.length);
        if (piece.segmentIndex !== activeSegmentIndex) return <Text key={piece.segmentIndex}>{source}</Text>;

        const start = Math.max(0, Math.min(source.length, currentCharStart - piece.segmentOffset));
        const length = Math.max(0, Math.min(source.length - start, currentCharLength));
        if (length > 0) {
          return (
            <Text key={piece.segmentIndex} style={styles.activeSentence}>
              {source.slice(0, start)}
              <Text style={styles.currentWord}>{source.slice(start, start + length)}</Text>
              {source.slice(start + length)}
            </Text>
          );
        }
        return (
          <Text key={piece.segmentIndex} style={styles.activeSentence}>
            {source.slice(0, start)}
            <Text style={styles.currentWord}>{source.slice(start)}</Text>
          </Text>
        );
      })}
    </Text>
  );
});

/** Renders unmodified source spans; the active phrase/word only changes its presentation. */
export const NarrationTextSection = memo(function NarrationTextSection({
  title,
  pieces,
  segments,
  activeSegmentIndex,
  currentCharStart,
  currentCharLength,
  fontSize,
}: Props) {
  const runs = useMemo(() => {
    const groups: SpeechVisiblePiece[][] = [];
    for (let start = 0; start < pieces.length; start += RUN_SIZE) groups.push(pieces.slice(start, start + RUN_SIZE));
    return groups;
  }, [pieces]);

  return (
    <View style={styles.section}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {runs.length ? (
        <Text selectable style={[styles.body, { fontSize, lineHeight: Math.round(fontSize * 1.65) }]}>
          {runs.map((group, index) => {
            const first = group[0]?.segmentIndex ?? -1;
            const last = group[group.length - 1]?.segmentIndex ?? -1;
            const activeIndex = activeSegmentIndex >= first && activeSegmentIndex <= last ? activeSegmentIndex : -1;
            return <SpeechTextRun
              key={index}
              pieces={group}
              segments={segments}
              activeSegmentIndex={activeIndex}
              currentCharStart={activeIndex >= 0 ? currentCharStart : 0}
              currentCharLength={activeIndex >= 0 ? currentCharLength : 0}
            />;
          })}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  section: { marginBottom: 28 },
  title: { color: C.cyan, fontSize: 17, fontWeight: "700", marginBottom: 18 },
  body: { color: C.text, letterSpacing: 0.2 },
  activeSentence: { backgroundColor: C.active, color: "#f4f1ff" },
  currentWord: { backgroundColor: C.word, color: C.bg, fontWeight: "800" },
});
