import Constants from "expo-constants";
import { StyleSheet, Text, View } from "react-native";

type PdfProps = { source: { uri: string; cache: boolean }; page: number; enablePaging: boolean; horizontal: boolean; fitPolicy: number; spacing: number; onPageChanged: (page: number, total: number) => void; onLoadComplete: (total: number) => void; onError: (error: unknown) => void; style: object };
type PdfComponent = React.ComponentType<PdfProps>;

let NativePdf: PdfComponent | null = null;
// eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module is absent in Expo Go
try { NativePdf = require("react-native-pdf").default as PdfComponent; } catch { NativePdf = null; }
const runningInExpoGo = Constants.executionEnvironment === "storeClient";

export function PdfViewer({ uri, initialPage, onPageChanged, onLoaded, onError }: {
  uri: string; initialPage: number; onPageChanged: (page: number, total: number) => void; onLoaded: (total: number) => void; onError: (message: string) => void;
}) {
  if (runningInExpoGo || !NativePdf) {
    return <View style={[styles.container, styles.fallback]}><Text style={styles.fallbackTitle}>PDF precisa do app nativo</Text><Text style={styles.fallbackText}>O Expo Go e o Preview Web não trazem o módulo PDF. Gere e instale o build local descrito em BUILD-ANDROID.md.</Text></View>;
  }

  return (
    <View style={styles.container}>
      <NativePdf
        source={{ uri, cache: true }}
        page={Math.max(1, initialPage)}
        enablePaging
        horizontal={false}
        fitPolicy={0}
        spacing={8}
        onPageChanged={onPageChanged}
        onLoadComplete={(total) => onLoaded(total)}
        onError={(error) => onError(error instanceof Error ? error.message : "Não foi possível abrir este PDF.")}
        style={styles.pdf}
      />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: "#070a16" }, pdf: { flex: 1, width: "100%", backgroundColor: "#070a16" }, fallback: { alignItems: "center", justifyContent: "center", padding: 24, gap: 10 }, fallbackTitle: { color: "#f2f4ff", fontSize: 18, fontWeight: "700", textAlign: "center" }, fallbackText: { color: "#a4abc5", fontSize: 13, lineHeight: 20, textAlign: "center" } });
