import { StyleSheet, Text, View } from "react-native";

type Props = {
  uri: string;
  initialPage: number;
  onPageChanged: (page: number, total: number) => void;
  onLoaded: (total: number) => void;
  onError: (message: string) => void;
};

export function PdfViewer({ uri }: Props) {
  if (!uri) return <View style={styles.container}><Text style={styles.message}>Selecione um PDF local para visualizar.</Text></View>;
  return <View style={styles.container}><Text style={styles.message}>O leitor PDF é carregado pelo módulo apropriado à plataforma.</Text></View>;
}

const styles = StyleSheet.create({ container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 22, backgroundColor: "#070a16" }, message: { color: "#b9c1d9", textAlign: "center" } });
