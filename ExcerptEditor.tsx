import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

const C = { bg: "#090c1c", panel: "#14142b", text: "#f5f6ff", muted: "#a2a9c1", pink: "#e333ff", cyan: "#12ddff" };

export function ExcerptEditor({ visible, initialValue, onSave, onCancel }: {
  visible: boolean; initialValue: string; onSave: (quote: string) => void; onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.scrim} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.viewport} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.dialog}>
            <Text style={styles.title}>{initialValue ? "Editar trecho" : "Marcar trecho"}</Text>
            <Text style={styles.hint}>Selecione e copie um trecho do livro, depois cole aqui. Ele fica salvo só neste aparelho.</Text>
            <TextInput value={value} onChangeText={setValue} placeholder="Cole ou escreva o trecho…" placeholderTextColor="#8188a5" multiline maxLength={1200} autoFocus style={styles.input} />
            <View style={styles.row}>
              <Pressable onPress={onCancel} style={styles.cancel}><Text style={styles.cancelText}>Cancelar</Text></Pressable>
              <Pressable onPress={() => value.trim() && onSave(value.trim())} style={[styles.save, !value.trim() && styles.disabled]}><Text style={styles.saveText}>Salvar trecho</Text></Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({ scrim: { flex: 1, justifyContent: "center", padding: 12, backgroundColor: "rgba(0,0,0,0.74)" }, viewport: { flexGrow: 1, justifyContent: "center", paddingVertical: 8 }, dialog: { backgroundColor: C.panel, borderColor: C.pink, borderWidth: 1, borderRadius: 17, padding: 18, maxWidth: 520, width: "100%", alignSelf: "center" }, title: { color: C.text, fontSize: 20, fontWeight: "800" }, hint: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 8 }, input: { minHeight: 105, maxHeight: 190, borderWidth: 1, borderColor: "#3e3867", borderRadius: 10, color: C.text, backgroundColor: C.bg, padding: 12, fontSize: 15, lineHeight: 22, textAlignVertical: "top", marginTop: 14 }, row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginTop: 14 }, cancel: { minHeight: 42, paddingHorizontal: 14, justifyContent: "center" }, cancelText: { color: C.muted, fontWeight: "600" }, save: { minHeight: 42, backgroundColor: "#54129a", borderColor: C.cyan, borderWidth: 1, borderRadius: 9, paddingHorizontal: 14, justifyContent: "center" }, saveText: { color: C.text, fontWeight: "700" }, disabled: { opacity: 0.4 } });
