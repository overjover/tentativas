# LeitorPlay

Biblioteca móvel local para livros, documentos, imagens e mangás, com identidade neon baseada na referência fornecida. Capas importadas ou extraídas são mostradas quando disponíveis; arquivos sem capa recebem um placeholder. Biblioteca, favoritos, trechos, progresso e preferências ficam no aparelho; o fluxo de leitura não pede chave de API nem envia documentos a um servidor.

## Formatos nesta versão

- Livros: EPUB, MOBI/AZW/AZW3 sem DRM, FB2, DOCX, RTF, TXT, Markdown e HTML.
- Documentos: PDF.
- Quadrinhos: CBZ/ZIP e CBR/RAR.
- Imagens/páginas: JPG/JPEG, PNG, WEBP, GIF, AVIF e BMP.

PDF e CBR/RAR precisam de build nativo Expo. MOBI/AZW3 só funciona sem DRM e tem limite de 48 MB; texto tem limite de 24 MB. EPUB nativo é processado em blocos com proteção contra arquivo/expansão excessivos. Veja **Mais → Formatos nesta versão** para os limites. OCR para PDFs digitalizados ainda não existe; os arquivos EPUB/MOBI não substituem DRM.

## Começar no computador

Requisitos: Node.js, pnpm 9.12.0 e, para compilar no Android, Android Studio/SDK e ADB.

```bash
pnpm install --frozen-lockfile
pnpm exec expo start --web --port 8081
```

A biblioteca local roda sem configuração de chave/API. Para validar a saúde do código:

```bash
pnpm check
pnpm test
pnpm lint
```

## Testar no Android

Este projeto inclui dependências nativas; Expo Go não contém o visualizador PDF nem o módulo CBR/RAR. Com um telefone Android conectado via USB/ADB, compile e instale a build de desenvolvimento local (sem EAS nem serviço remoto pago):

```bash
pnpm install --frozen-lockfile
pnpm exec expo prebuild --platform android --no-install
pnpm exec expo run:android
```

Mantenha o Metro aberto durante o teste. O projeto configura Android API 24 como mínimo, mas esse alvo ainda precisa de validação num aparelho API 24/25. O ambiente onde este código foi preparado não tem Android SDK/ADB; nenhum APK foi compilado aqui. Detalhes: [`BUILD-ANDROID.md`](./BUILD-ANDROID.md).

## Ler, narração e dados

A narração usa as vozes disponíveis no sistema (`expo-speech`), preserva texto e pontuação e separa apenas frases/parágrafos ou limites de tamanho. O modo contextual opcional reage com moderação a marcadores explícitos próximos; não troca a voz nem gera conteúdo. Quando o engine envia callbacks, há destaque da palavra e checkpoint UTF-16; sem eles, o destaque é por frase e pause, Stop e timer terminam no limite seguro seguinte/fim da frase, evitando reiniciar a obra do começo. Os controles anterior/próxima frase, retomada e timer usam a mesma fila técnica. A fila sobrevive à navegação entre telas, mas ainda não há serviço Android em primeiro plano ou sessão de mídia nativa: reprodução em segundo plano/encerramento não é garantida. Estatísticas mostram somente valores locais efetivamente calculados; o histórico não inventa eventos da trama. Fichas/cronologia narrativa dependem de um guia fornecido à parte.

O backup exporta arquivos, capas, progresso, favoritos e trechos em ZIP local de até 512 MB; a restauração valida caminhos e mescla sem apagar a biblioteca atual. Não há upload de backup.

## Testes e limites pendentes

Vitest cobre fidelidade de texto/offsets, pausas e perfis TTS, 12.000 frases, estado/serialização da biblioteca, leitura TXT/EPUB, reconhecimento PDF/formato, falhas EPUB e backup/restauração. Visualização PDF e módulos CBR/RAR/MOBI, segundo plano, insets de aparelhos, arquivos grandes e API 24/25 precisam ser verificados no build local com hardware ou emulador. Os APKs de referência fornecidos continham apenas binários, não um repositório ou branches recuperáveis.
