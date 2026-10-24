import { StyleSheet, Text, View } from "react-native";

export function PdfViewer({ uri, onError }: {
  uri: string; initialPage: number; onPageChanged: (page: number, total: number) => void; onLoaded: (total: number) => void; onError: (message: string) => void;
}) {
  if (!uri) {
    onError("Selecione um PDF local para visualizar.");
    return <View style={styles.fallback}><Text style={styles.message}>Não há PDF para abrir.</Text></View>;
  }
  return (
    <View style={styles.container}>
      <iframe title="Leitor de PDF" src={uri} style={{ border: 0, width: "100%", height: "100%", background: "#070a16" }} />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: "#070a16" }, fallback: { flex: 1, alignItems: "center", justifyContent: "center" }, message: { color: "#fff" } });
