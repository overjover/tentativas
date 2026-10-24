import { memo } from "react";
import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";

type VisibleSpeechPiece = { text: string; segmentIndex: number; segmentOffset: number };

type Props = {
  pieces: VisibleSpeechPiece[];
  activeSegmentIndex: number;
  currentCharStart: number;
  currentCharLength: number;
  style: StyleProp<TextStyle>;
};

function NarratableTextComponent({ pieces, activeSegmentIndex, currentCharStart, currentCharLength, style }: Props) {
  return (
    <Text selectable style={style}>
      {pieces.map((piece) => {
        const key = `${piece.segmentIndex}-${piece.segmentOffset}`;
        if (piece.segmentIndex !== activeSegmentIndex) return <Text key={key}>{piece.text}</Text>;
        const start = Math.min(piece.text.length, Math.max(0, currentCharStart - piece.segmentOffset));
        const end = currentCharLength > 0 ? Math.min(piece.text.length, start + currentCharLength) : piece.text.length;
        if (end <= start) return <Text key={key}>{piece.text}</Text>;
        return (
          <Text key={key} style={styles.activeSentence}>
            {piece.text.slice(0, start)}
            {currentCharLength > 0
              ? <Text style={styles.activeWord}>{piece.text.slice(start, end)}</Text>
              : piece.text.slice(start, end)}
            {piece.text.slice(end)}
          </Text>
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  activeSentence: { backgroundColor: "#282044", color: "#ffffff" },
  activeWord: { backgroundColor: "#12ddff", color: "#06111b", fontWeight: "800" },
});

export const NarratableText = memo(NarratableTextComponent);
export type { VisibleSpeechPiece };
