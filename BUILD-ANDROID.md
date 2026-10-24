# Testar no Android, sem build hospedado

O app foi iniciado no template React Native/Expo deste projeto e usa módulos nativos de PDF e descompactação CBR/RAR. **Não é preciso instalar ou abrir o Expo Go**: o APK compilado é o próprio LeitorPlay. A preparação e o build abaixo rodam localmente (não usam tunnel, EAS, conta Expo ou serviço pago) e não exigem chave de API. Remover também as bibliotecas Expo significaria migrar para outro projeto Android nativo, fora do scaffold Mobile já inicializado.

## Requisitos

- Android Studio e Android SDK instalados (Android 7 / API 24 como mínimo configurado no projeto).
- Node.js e pnpm 9.12.0.
- Celular Android com depuração USB ativada, conectado ao computador. Os dois podem usar Wi-Fi local, sem publicar os livros na internet.

## Build de teste com aparelho conectado

Na pasta do projeto, execute:

```bash
pnpm install --frozen-lockfile
pnpm exec expo prebuild --platform android --no-install
pnpm exec expo run:android
```

O Expo compila/instala o variant de desenvolvimento local e inicia o Metro. Mantenha o servidor Metro aberto enquanto testa. Se o celular e o computador estiverem em redes diferentes, configure a conexão USB/ADB antes de iniciar. Para uma nova instalação, o comando também instala o APK no aparelho conectado.

## Abrir no Android Studio

Depois do prebuild local, abra a pasta `android/` no Android Studio e sincronize o projeto Gradle. Para executar o app de depuração, mantenha o Metro local ativo e selecione o aparelho conectado na barra **Run**. Isso inicia/instala o app **LeitorPlay** diretamente; não escaneie QR e não use Expo Go.

Para uma compilação e instalação guiadas pelo template com um aparelho via USB/ADB, `pnpm exec expo run:android` faz o mesmo processo e inicia o Metro local; não chama serviço de build hospedado.

## Restrições desta entrega

Este ambiente de trabalho não possui Android SDK/ADB, então o arquivo APK não foi compilado nem instalado nesta sessão. CBR/RAR, sessão de mídia, background TTS e funcionamento em Android API 24–25 ainda precisam de verificação em dispositivo físico após o build local. O build é de teste, não release; não reutilize o APK de depuração para publicar na Play Store.
