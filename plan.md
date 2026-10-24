# LeitorPlay — plano aprovado e decisões de implementação

## Objetivo e contexto

O pedido evoluiu de uma nova implementação Expo para: reproduzir a tela LeitorPlay da referência enviada; manter uma biblioteca pessoal offline, sem chaves de API nem serviços pagos; adicionar leitores gratuitos para livros e mangás; mostrar capa/metadados quando existirem; completar os controles já desenhados; preservar voz/progresso/dados; respeitar recortes e controles de Android; e preparar o repositório para teste em um telefone.

Os arquivos recebidos `LeitorPlay-debug.zip` e `LivroVoz-debug-APK.zip` contêm apenas `app-debug.apk`, não contêm código-fonte nem uma branch para merge. O projeto Expo atual é uma implementação nova e usa o nome/pacote LeitorPlay; não é possível recuperar código-fonte, chaves ou funcionalidades proprietárias desses APKs.

## Direção visual

A captura de tela fornecida é a referência de aparência e organização; não substituir por stock/arte gerada.

- **Movimento de design:** cyberpunk de arcade editorial, com molduras de interface sci-fi e estética de biblioteca de mídia.
- **Princípios:** biblioteca sem conta; a leitura manda; neon é navegação/ênfase, não conteúdo; ações e estados vazios sempre claros.
- **Cores:** fundo azul-marinho quase preto (`#060914`) para foco e conforto; magenta/violeta para descoberta e ação; ciano elétrico para estado/links; cartões um pouco mais claros; texto branco suave e cinza azulado.
- **Layout:** fluxo vertical que cabe no telefone; marca e perfil no topo, busca, faixa “Surpreenda-me”, trilho horizontal “Continuar lendo”, coleção em duas colunas adaptáveis, botão Adicionar e tabs Biblioteca/Favoritos/Mais. Safe areas deixam status bar, gestos, navegação Android e teclado descobertos.
- **Elementos de assinatura:** cantos chanfrados/molduras de brilho rosa e ciano, barra dupla de acento de seção, marca de livro aberto com play.
- **Interação/animação:** resposta breve de toque e transições discretas de progresso/capa; sem parallax ou brilho pulsante que atrapalhe a leitura; controles com alvo grande e suporte ao teclado/insets.
- **Tipografia:** sans do sistema para leitura e dados; wordmark inclinado/extra-negrito; hierarquia com títulos 34–36 px, seções 19 px e apoio 10–13 px. Respeitar compactação em telas estreitas.
- **Essência/voz:** “Sua estante. Seus arquivos. Sua próxima página.” Personalidade direta, acolhedora e exploradora. Exemplos: “Continue de onde a história parou.” / “Escolha um arquivo; o resto fica por aqui.”
- **Wordmark/ícone:** Leitor em branco com Play em magenta/ciano; livro aberto com triângulo de reprodução em dois tons. Ícones nativos nos assets e `logoUrl` HTTPS literal do projeto.

## Comportamento planejado

### Biblioteca e navegação

- Biblioteca home baseada na captura: cabeçalho, busca por título/autor/nome, filtro por formato, sugestão local aleatória, trilho de leituras recentes, cards com capa e placeholder quando não há imagem, favorito e ação de continuar.
- Favoritos mostra itens marcados e trechos salvos com a fonte/página; criar, editar e remover trechos, reabrir o ponto correspondente e preservar ações com modal/teclado também no Android.
- Mais contém ajustes da leitura, direção de páginas mangá (RTL/LTR), fonte, voz/ritmo/timbre e timer; inclui estatísticas calculadas com a biblioteca e backup/restauração local.

### Arquivos e recursos

Importar por seletor do sistema e manter cópia local de app para evitar dependência de uma permissão de URI temporária. Formatos incorporados sem serviço pago ou chave: PDF, EPUB, TXT, Markdown, HTML, FB2, DOCX, RTF, imagens JPG/JPEG/PNG/WEBP/GIF/AVIF/BMP, comics CBZ/ZIP e comics CBR/RAR, além de livros MOBI/AZW/AZW3 sem DRM. A marca do arquivo e as informações do EPUB (título/autor/manifest/spine) são preservadas; capas de EPUB/MOBI/arquivos de imagem e primeira página de comic são usadas quando extraíveis; os demais têm placeholder tipográfico. Favoritos, progresso, página/posição e trechos são locais.

- ZIP/EPUB/Web: leitura por biblioteca JS existente, limitada a 48 MB no caminho Web/ZIP genérico.
- EPUB nativo: fflate em blocos de 64 KiB; limite de 256 MB compactados, 32 MB de texto interno, 512 MB descompactados e 8 MB por capa. Apenas metadados/texto/capa são retidos; a ordem de leitura segue `spine`, e o nome “Parte N” não afirma um título editorial inexistente.
- DOCX e MOBI/AZW3 sem DRM: leitura offline; MOBI/AZW3 tem limite de 48 MB porque o parser usa buffer.
- Texto: limite explícito de 24 MB; PDF usa o visualizador nativo paginado.
- CBZ/ZIP no Web usa extração local; comics Android/iOS usa `react-native-unarchive` nativo para CBZ/CBR/RAR/ZIP, até 2.000 páginas e 1 GiB total de imagens. A ordenação de nome numérico, direção RTL/LTR e progresso por página ficam no aparelho.
- PDF escaneado não tem OCR; é tratado como limitação futura. A detecção automática de PDF sem camada de texto ainda não foi adicionada.
- Arquivos com DRM, extensões desconhecidas e arquivos cujo conteúdo/permissão desapareceu exibem erro para reimportação; não simulamos compatibilidade.

### Narração e integridade

A narração usa vozes do sintetizador local via `expo-speech` (sem chave nem envio dos arquivos). Estado/fila ficam em Provider no nível raiz, com posição por segmento e offset UTF-16 quando o engine fornece boundary; pontuação/parágrafo gera pausas com `speech-queue.ts`. Destaque, frase anterior/próxima, pausa, retomada, Stop, timer e progresso compartilham essa fila. Com callbacks, pause/Stop/timer salvam e encerram no próximo boundary seguro; sem callback, aguardam o fim da frase, para evitar corte/perda. Voz, pitch/rate, emoção e timer não se confundem com capítulos editoriais; parâmetros alterados durante fala aplicam-se na frase seguinte.

**Limitação importante:** o estado está fora das rotas/tabs, mas ainda vive na instância JS/Activity. Não existe serviço Android de TTS em primeiro plano nem MediaSession nativa; reprodução ao sair/encerrar o app e consistência de notificação/sessão continuam sem verificação e não devem ser prometidas como concluídas. Android API 24–25 e vozes de fabricantes precisam de verificação num aparelho físico.

### Dados, backup e custos

AsyncStorage é a fonte local de biblioteca, favoritos, progresso, trechos e segundos de narração ativa. O backup em ZIP serializa manifesto e arquivos em blocos de 64 KiB, com versões, limites, validação de caminhos, staging, ID sem colisão e restauração por merge sem apagar/duplicar o acervo. Não usa banco, upload ou API para os itens de leitura. Dependências escolhidas são open-source/gratuitas (entre elas Expo modules, fflate, react-native-pdf, react-native-unarchive e mobi-parser MIT). Não instalar chaves, plano de OCR/TTS pago, EAS build ou serviço de API externo.

## Estrutura do projeto

- `app/(tabs)/index.tsx`: Biblioteca conforme referência.
- `app/(tabs)/favorites.tsx`, `more.tsx`, `_layout.tsx`: Favoritos/trechos, ajustes/dados e abas.
- `app/reader/[id].tsx`: leitor por formato, navegação/progresso, voz e citações.
- `components/library/`: capas/cards; `components/reader/`: PDF por plataforma e editor de trecho.
- `lib/reader/format-registry.ts`: reconhecimento/importação/parsing local, limites e reconstrução de comics.
- `lib/reader/library-context.tsx`, `library-store.ts`, `library-state.ts`, `preferences.ts`: estado persistido/ações/preferências.
- `lib/reader/speech-queue.ts`, `narration-context.tsx`: segmentação, TTS e estado global enquanto a Activity vive.
- `lib/reader/backup.ts`: backup/restore streaming, sem conta.
- Arquivos `.test.ts`: regressões de fila, estado, formatos e restauração.
- `BUILD-ANDROID.md`: instruções de build/teste local gratuito no aparelho.

## Validação e limites

TypeScript, lint, testes unitários e Expo config devem passar. Preview Web confirma UI/fluxos visíveis, mas não prova módulos nativos. O Sandbox não tem Android SDK/ADB; APK precisa ser compilado localmente com Android Studio e `expo run:android`. Por ser projeto Mobile gerenciado, repositório canônico é Manus-managed; `origin/main` recebe checkpoint, auto-publish foi confirmado desligado. Não há branches de código do APK anexado. Não preparar/signar/publicar release sem validação funcional em dispositivo.

## Fontes técnicas consultadas

- Expo Speech SDK 57: https://docs.expo.dev/versions/v57.0.0/sdk/speech/
- Android `UtteranceProgressListener`: https://developer.android.com/reference/android/speech/tts/UtteranceProgressListener
- Expo FileSystem SDK 57: https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/
- Expo Notifications: https://docs.expo.dev/versions/latest/sdk/notifications/
- Track Player, background mode: https://rntp.dev/docs/basics/background-mode
- `react-native-unarchive` (MIT): https://github.com/pushpender-singh-ap/react-native-unarchive
- `@lingo-reader/mobi-parser` (MIT): https://www.npmjs.com/package/@lingo-reader/mobi-parser
- `libunrar-js` (alternativa rejeitada por licença/consumo de memória): https://github.com/wcchoi/libunrar-js


## Asset original para a faixa de descoberta

A faixa “Surpreenda-me” receberá uma ilustração nova de livro aberto, distinta da captura enviada e sem texto, via imagem Agent já administrada em `/manus-storage/async-images/ti7dLf0jBtnXmIMCCeVSQw/image-1.webp`. A tela usa `expo-image` e dimensões adaptáveis; em largura menor que 370 dp o elemento é omitido e em Android nativo, sem URL absoluta para armazenamento estável, preserva-se o desenho leve de livro como fallback. A geração da imagem continua assíncrona; até a conclusão o caminho gerenciado pode mostrar o placeholder automático. Capas importadas pelos usuários, por sua vez, são arquivos locais e aparecem nativamente.

- `README.md`: guia rápido de instalação/uso, dependências, formatos, testes e limites conhecidos para preservar o contexto ao clonar o repositório.


## Ampliação da narração contextual (pedido de 2026-10-24)

A narração permanece local, sem chaves/API e sem classificação por LLM. A implementação usa o Android TextToSpeech através do Expo Speech já instalado. Segmenta por frase/parágrafo mantendo o texto-fonte e offsets UTF-16; vírgulas, dois-pontos, travessões e reticências permanecem dentro da frase para o próprio sintetizador respeitar a prosódia. Apenas marcadores explícitos próximos — por exemplo, “sussurrou”, “gritou”, “perguntou”, além de palavras narrativas claramente emocionais — podem alterar **com moderação** o ritmo, tom/altura e volume; a voz escolhida não muda. Sinais ambíguos mantêm leitura neutra. O modo contextual é desligável nas configurações.

O callback nativo `SpeechOptions.onBoundary` permite marcar a palavra atual e criar checkpoints do segmento quando o motor do dispositivo fornece limites. O projeto também tem fallback: no Android API 24–25 ou em engines sem callback, a UI destaca a frase inteira e a pausa é concluída com segurança ao final da frase (sem cortar texto); o checkpoint continua pelo menos no limite da frase. O controle não promete controle de emoção, fonema ou pausa intrafrase em motores sem suporte. Rate/pitch escolhidos se aplicam no próximo limite de frase, em vez de cortar e repetir o segmento atual. Próxima/anterior frase, timer, posição e destaque usam os mesmos segmentos técnicos — que nunca são chamados de capítulos editoriais.

Títulos gerados somente para apresentação da ordem do EPUB não entram no texto narrado; os títulos/texto que realmente fazem parte do corpo do documento continuam visíveis e, quando presentes no corpo, são lidos em ordem. Cada segmento mantém início/fim na fonte. A tela mostra o progresso da fala sincronizado (palavra pelo callback ou frase no fallback). A segmentação precisa comprovar reconstrução exata da string; o processamento não sintetiza conteúdo explicativo nem altera fala original. Testes cobrem prosa, diálogo, ação, suspense, pontuação incomum e textos longos. As limitações do serviço TTS do dispositivo, especialmente pausa real dentro de uma frase e reprodução garantida em background, continuam explícitas; esta mudança não cria um serviço Android/media session nativo nem promete efeitos não suportados.
