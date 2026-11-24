# Scout Design System — proposta de consolidação

**Status:** Fases 2 e 3 implementadas · Fase 4.1 (Dashboard) concluída.

Este documento separa os princípios observados no Sellbird das decisões propostas para o Scout. O Sellbird serve como referência de produto e consistência, não como fonte para copiar código ou identidade visual. A identidade Scout continua sendo a logo fornecida e a paleta verde definida no projeto.

## 1. Referência Sellbird

O repositório oficial consultado é [ethanplusai/sellbird](https://github.com/ethanplusai/sellbird), identificado pelo site oficial do produto. A estrutura visível inclui diretórios distintos para `sellbird`, `harvey`, `docs`, `prompts`, `scripts`, `skills` e `tests`, sugerindo separação entre aplicação, compatibilidade/migração, documentação e recursos de agente. O projeto é Python com dashboard local.

### Princípios visuais e de produto aproveitáveis

A referência pública apresenta uma ferramenta operacional focada em prospecção: apresenta o próximo trabalho e seu estado, contextualiza ações comerciais, explicita limitações e mantém o fluxo de pesquisa, qualificação e outreach compreensível. Para Scout, esses princípios se traduzem em:

- mostrar contexto e estado junto da ação;
- preservar hierarquia e leitura rápida em listas densas;
- usar linguagem direta e estados explícitos;
- manter navegação e controles previsíveis entre áreas;
- tornar filas, permissões, critérios e resultados verificáveis.

**Limite da inspeção:** a página pública do repositório permite confirmar sua estrutura geral, mas não foi feita uma execução autenticada e completa de todas as telas do dashboard. Portanto, este documento não atribui ao Sellbird valores exatos de tokens, medidas de sidebar, tipografia ou componentes que não foram observados de forma confiável. Os números abaixo são propostas próprias para o Scout.

### Licença e uso da referência

O repositório informa licença **AGPL-3.0-only** para a versão atual (0.4.0+); versões até 0.3.x foram publicadas sob MIT. Esta proposta não copia código, componentes, ícones, textos de interface nem ativos do projeto. Se uma implementação futura quiser reutilizar código, deve rever a licença da versão e dos arquivos específicos e obter revisão de licenciamento antes. Fonte: [repositório Sellbird](https://github.com/ethanplusai/sellbird), [LICENSE/NOTICE](https://github.com/ethanplusai/sellbird/blob/main/LICENSE), [anúncio oficial da mudança](https://sellbird.ai/harvey/).

## 2. Auditoria do Scout

### Base observada

- React, TypeScript, Vite e Tailwind CSS estão presentes. A interface existente usa principalmente `src/styles.css` tradicional; Tailwind não é hoje a fonte central de composição visual.
- `src/styles.css` tem cerca de **3.680 linhas**, **56 blocos `@media`**, aproximadamente **420 cores hexadecimais únicas**, mais de **300 declarações de padding**, **200 border-radii** e **26 valores distintos de font-size**. Esses números são uma contagem estática aproximada, não uma avaliação de pixels renderizados.
- Há tokens globais iniciais em `:root` (`--ink`, `--muted`, `--line`, `--surface`, `--brand`, `--focus` e semânticos), mas diversas regras continuam com cores, dimensões e estados escritos diretamente.
- A folha reúne estilos globais, regras de componentes, sobrescritas posteriores por página e media queries distribuídas por toda a extensão. Algumas regras tardias refinam estilos anteriores, tornando a cascata difícil de entender.
- `src/App.tsx` contém a maior parte da interface e ultrapassa 4 mil linhas. Vários componentes de página compartilham classes, enquanto algumas áreas, como Outbox, CRM, Settings, campanhas e pesquisa, mantêm estilos próprios.
- Não há atualmente documentação central de design system em `docs/`.

### Inconsistências e riscos

| Área | Evidência na base atual | Risco para consistência |
|---|---|---|
| Cores | Tokens verdes coexistem com muitos tons fixos azulados; alguns estados roxos/azuis permanecem em estilos de status/hover e regras antigas. | Ajustar a marca global não atualiza automaticamente superfícies, hover, bordas, foco e seleções. Cores semânticas podem ser confundidas com branding. |
| Tipografia | `h1/h2/h3` globais coexistem com tamanhos locais e específicos de página; aproximadamente 26 tamanhos aparecem. | Dificulta comparar níveis equivalentes entre páginas e aumenta sobrescritas. |
| Espaçamento | Há muitos valores pontuais de padding/margin e 38 valores de `gap`. | Elementos equivalentes recebem densidades e distâncias diferentes. |
| Cards | O painel de CRM define cards métricos com 106px mínimos; Campanhas usa métricas com 108px; Settings e painéis usam padding/radii próprios. | Indicadores e superfícies semelhantes parecem pertencer a sistemas diferentes. |
| Controles | Botões base existem, mas `.secondary`, `.tertiary`, `.quiet-action`, `.export` e variações locais têm cores, altura/padding e estados diferentes. | Ação primária/secundária varia conforme a página; foco e hover não têm cobertura uniforme. |
| Formulários | `label`, `input`, `select`, `.form-grid`, `.settings-form-grid` e controles especializados acumulam declarações distintas. Há sobreposição de regras globais e locais. | Alturas, raios, tipografia, foco e espaçamento não são uniformes; regras genéricas podem vazar para contextos especiais. |
| Tabelas | `lead-table`, `campaign-table`, `pipeline-table` e wrappers próprios tratam scroll, densidade e cabeçalho separadamente. | Mesmo tipo de informação recebe separadores, hover, largura mínima e comportamento responsivo distintos. |
| Modais | Classes específicas (incluindo Outbox e detalhes de lead) definem backdrop, largura, raio, sombra e padding separadamente. | A experiência de diálogo muda entre fluxos e fica difícil garantir foco/scroll consistentes. |
| Status | Status comerciais têm cores próprias, mas convivem com acentos de marca e com status de auditoria, conexão e envio. | Mudança de paleta pode apagar distinções semânticas se feita por substituição global. |
| Layout | `main` tem padding global; páginas como Settings limitam largura localmente; diversas views usam grids e margens próprios. | A largura útil/alinhamento e o ritmo de cabeçalho dependem da página. |
| Responsividade | Media queries repetidas em pontos diferentes, com breakpoints 560, 650, 760, 800, 900, 960, 1050 e outros. | Comportamentos concorrentes ficam difíceis de prever e testar. |
| Marca | Há tokens centrais, logo em ativo público e regras posteriores para dimensionar logo; estilos antigos ainda convivem na cascata. | Mudanças futuras podem reintroduzir alinhamento ou cores antigos sem intenção. |

### Duplicação e oportunidades

1. Consolidar componentes visuais equivalentes: `MetricCard`, `PageHeader`, `Surface/Card`, `Button`, `Field`, `Badge`, `EmptyState`, `TableShell`, `Toolbar` e `Dialog`.
2. Definir um container de página único para largura, gutters e alinhamento de títulos.
3. Separar tokens de identidade, semântica e componentes: `brand` nunca deve substituir `success`, `warning`, `error` ou níveis de oportunidade.
4. Reduzir sobrescritas tardias em `styles.css` migrando por componente/página, sem reescrever a folha inteira.
5. Formalizar breakpoints em uma escala curta e usar tokens de espaçamento/tamanho em vez de valores avulsos.
6. Documentar componentes acessíveis e estados: hover, active, focus-visible, disabled, loading, empty e error.

## 3. Especificação proposta para Scout

Os valores seguintes são **proposta para o Scout**, não valores atribuídos ao Sellbird.

### 3.1 Tokens de cor

| Token | Valor | Uso |
|---|---|---|
| `--color-brand` | `#2E8B57` | Identidade e detalhes de marca; não usar como botão com texto branco |
| `--color-brand-hover` | `#267549` | Tom de marca escuro para elementos sem texto branco |
| `--color-action` | `#278050` | Fundo de ação primária com texto branco |
| `--color-action-hover` | `#226C43` | Hover de ação primária |
| `--color-brand-soft` | `#E8F5ED` | Seleção ativa, foco contextual suave |
| `--color-brand-border` | `#CDE7D6` | Borda de seleção/hover da marca |
| `--color-success` / `--color-success-soft` | `#15803D` / `#E8F5ED` | Semântica de sucesso |
| `--color-warning` / `--color-warning-soft` | `#C2410C` / `#FFF4DF` | Semântica de alerta |
| `--color-danger` / `--color-danger-soft` | `#DC2626` / `#FFF0EE` | Semântica de erro |
| `--color-info` / `--color-info-soft` | `#2563EB` / `#EFF6FF` | Semântica informativa |
| `--color-neutral` / `--color-neutral-soft` | `#475569` / `#F1F3F5` | Estado neutro |
| `--color-bg` | `#F7F8FA` | Fundo principal |
| `--color-surface` | `#FFFFFF` | Cards, popovers, diálogos e campos |
| `--color-fg` | `#18221C` | Texto principal |
| `--color-muted` | `#68736D` | Texto auxiliar, labels e ícones neutros |
| `--color-border` | `#E2E7E9` | Borda padrão discreta |
| `--color-focus` | `#278050` | Foco acessível, com halo claro |

#### Separação de famílias cromáticas

O Scout mantém três famílias independentes. Não reutilizar uma família como substituta de outra:

| Família | Tokens `--scout-*` | Uso | Regra |
|---|---|---|---|
| **Brand Colors** | `--scout-brand`, `--scout-brand-hover`, `--scout-brand-soft`, `--scout-brand-border`, `--scout-action`, `--scout-action-hover` | Identidade institucional, navegação e ações de marca | Preservar o verde aprovado; ação primária usa `#278050`, não a cor de marca clara. |
| **Chart Colors** | `--scout-chart-high`, `--scout-chart-medium`, `--scout-chart-low`, `--scout-chart-blue`, `--scout-chart-teal`, `--scout-chart-cyan` | Fatias, séries, marcadores e legendas analíticas | Paleta expressiva própria; usar para codificar dados, nunca para estados de interação globais. |
| **Semantic Colors** | `--scout-success`, `--scout-warning`, `--scout-danger`, `--scout-info`, `--scout-neutral` e variantes | Sucesso, alerta, erro, informação e estados do produto | O significado funcional prevalece; não alterar estado para harmonizar com uma visualização. |

Paleta analítica aprovada para Scout: `--scout-chart-high: #16A34A`, `--scout-chart-medium: #D97706` e `--scout-chart-low: #64748B`. A paleta complementar categórica é `--scout-chart-blue: #2563EB`, `--scout-chart-teal: #0F766E` e `--scout-chart-cyan: #0891B2`. As referências iniciais `#22C55E`, `#F59E0B` e `#94A3B8` são visualmente claras demais para marcas gráficas finas sobre branco; as versões refinadas preservam a intenção de verde, âmbar e cinza com contraste mínimo aproximado de 3:1 para elementos gráficos grandes contra branco (3.30:1, 3.19:1 e 4.76:1, respectivamente). Texto da legenda deve usar tokens de texto, não essas cores como texto pequeno. Cada categoria também precisa de rótulo ou valor; cor não é o único meio de identificação.

Cores semânticas permanecem separadas: `--scout-success`, `--scout-warning`, `--scout-danger`, `--scout-info`, `--scout-neutral` e tokens específicos de estágio/oportunidade. Não converter toda cor verde existente para `brand`: uma cor verde de status de sucesso não representa a ação primária. A lente verde-limão da logo é exclusiva do ativo de marca, sem uso em controles ou indicadores.

### 3.2 Tipografia

- Fonte existente: Inter; preservar o carregamento e fallback `system-ui, sans-serif`.
- Título de página: `24px / 600`; título de seção: `16px / 600`; título de card: `14px / 500`.
- Texto padrão: `14px / 400`; controles: `13px / 500`; metadados: `12px / 400`.
- Valores KPI: `28px / 600`, com `font-variant-numeric: tabular-nums`.
- Não ampliar títulos por viewport. Usar line-height entre 1.2 e 1.5 conforme função.
- Texto de ajuda essencial não deve ficar abaixo de 12px.

### 3.3 Espaçamento

Escala base de 4px: `0, 4, 8, 12, 16, 20, 24, 32, 40, 48`.

- 4–8px: ícone/label, conteúdo de badge, elementos de toolbar.
- 12px: campos e linhas compactas.
- 16px: padding padrão de card e espaçamento interno.
- 20–24px: separação de seções e cards de configuração.
- 32px: distância entre cabeçalho da página e conteúdo, quando a densidade permitir.
- 40–48px: mudanças de seção ou grandes blocos, não gaps rotineiros.

### 3.4 Raios e sombras

Escala oficial de cantos Scout:

| Papel | Token | Valor |
|---|---|---:|
| Cards, superfícies principais, MetricCards, containers de tabela e painéis | `--scout-radius-card` | 18px |
| Modal e diálogo | `--scout-radius-dialog` | 24px |
| Superfícies internas | `--scout-radius-surface-inner` ou token calculado pelo inset | 14–16px |
| Menus flutuantes e dropdowns | `--scout-radius-menu` | 12px |
| Botões, inputs e selects | `--scout-radius-control` | 10px |
| Containers pequenos de ícones | `--scout-radius-icon` | 8px |
| Badges e switches | `--scout-radius-pill` | 999px / circular |

Quando superfícies aninhadas compartilham o mesmo contorno geométrico, aplicar cantos concêntricos: `inner-radius = max(0px, outer-radius - inset)`. Os tokens `--scout-radius-surface-inset-2`, `-inset-3` e `-inset-4` usam `calc()` com os insets correspondentes. Por exemplo, raio externo de 18px com recuo de 2px resulta em 16px; recuo de 3px resulta em 15px; recuo de 4px resulta em 14px. Usar esse cálculo apenas quando as superfícies realmente acompanham o mesmo contorno. Componentes independentes dentro de um card — como botões e campos — mantêm seus próprios tokens de 10px.

Sombras permanecem discretas: `--scout-shadow-card` (nenhuma ou `0 1px 2px rgba(24,34,28,.04)`) e `--scout-shadow-popover` para menus/diálogos. Não usar sombras decorativas em superfícies de rotina.

### 3.5 Layout global

- Sidebar desktop: `236px`, superfície branca, borda direita 1px, logo preto no topo esquerdo; abaixo de 960px pode compactar para cerca de 68px e usar o ícone oficial.
- Mobile: barra superior, logo à esquerda e botão de navegação acessível à direita; menu expandido não deve empurrar conteúdo lateralmente.
- Conteúdo: um `.page-container` compartilhado, `width: 100%`, `max-width: 1600px`, padding horizontal `32px` em desktop e `16px` em mobile. Alinhar título, toolbar, cards e tabelas ao mesmo eixo.
- Cabeçalho de página: título, subtítulo e ação principal em uma única composição; colapsa verticalmente em mobile.
- Breakpoints propostos: `640px` mobile, `768px` tablet, `1024px` desktop compacto e `1280px` desktop amplo. Evitar novos breakpoints sem necessidade de conteúdo comprovada.
- Grids de indicadores: 4 colunas em desktop, 2 em tablet, 1–2 em mobile conforme legibilidade e largura útil.

### 3.6 Primitivos e componentes compartilhados

| Componente | Convenção proposta |
|---|---|
| `PageHeader` | `title`, `description`, `actions`; espaçamento e alinhamento comuns; sem eyebrow repetitivo. |
| `PageContainer` | Largura, gutters e eixo horizontal compartilhados. |
| `Card` / `Surface` | Branco, borda `--color-border`, raio 18px; padding padrão 16px; superfícies internas seguem o cálculo concêntrico quando aplicável. |
| `Button` | Variantes `primary`, `secondary`, `tertiary`, `quiet`, `danger`; altura padrão 36px; foco visível, disabled e loading consistentes. |
| `IconButton` | Controle visual de 36px, alvo touch mínimo de 44px quando possível, nome acessível obrigatório e foco visível. |
| `Input` / `Select` | Altura padrão 36px e raio 10px; preservar atributos e eventos nativos. |
| `Field` | Label, ajuda e erro associados por `id`/`aria-describedby`; obrigatório e inválido expostos semanticamente. |
| `Checkbox` / `Switch` | Controles acessíveis; área touch de 44px sempre que possível. |
| `Skeleton` | Variantes tipadas; respeita `prefers-reduced-motion`. |
| `Badge` | Semântica explícita (`success`, `warning`, `danger`, `info`, `neutral`, `brand`); não usar marca para estágio sem significado de marca. |
| `MetricCard` | Label 12px, valor 28px/600, ícone 16–18px e min-height 112px. |
| `TableShell` | Superfície compartilhada; linha padrão de 48px, expansível quando conteúdo exigir; wrapper controla scroll horizontal em viewport estreita. |
| `Toolbar` / `FilterBar` | Campo de busca expansível, controles 36px e chips de filtros ativos; quebra/rolagem planejada em mobile. |
| `EmptyState` | Título e explicação concreta; ação opcional; sem métricas fictícias. |
| `Dialog` | Largura máxima por tamanho, max-height `calc(100dvh - 32px)`, scroll interno, fechar/Escape/foco acessíveis. |


### 3.7 Estados, acessibilidade e i18n

- Controles têm hover, pressed, `:focus-visible`, disabled, loading e erro definidos em tokens/componentes.
- Contraste WCAG AA: 4.5:1 para texto normal e 3:1 para texto grande/ícones essenciais. Contrastes calculados (sRGB): branco sobre ação `#278050` = `4.90:1`; branco sobre hover `#226C43` = `6.38:1`; branco sobre marca `#2E8B57` = `4.25:1` (não usar em botão com texto branco); texto `#18221C` sobre fundo `#F7F8FA` = `15.39:1`; muted `#68736D` sobre branco = `4.93:1`; muted sobre fundo = `4.64:1`; texto sobre brand-soft = `14.57:1`. A marca escura `#267549` sobre branco = `5.64:1`. Texto dos badges nas superfícies propostas: success `6.23:1`, warning `5.44:1`, danger `6.69:1`, info `7.71:1`, neutral `6.81:1` e brand `7.05:1`. O foco de teclado usa contorno sólido da ação (`4.90:1` sobre branco).
- Cor nunca é o único meio de comunicar estado: usar rótulo, ícone ou texto auxiliar.
- Alvo de interação mínimo de 44px em touch sempre que possível; controles visuais padrão continuam com 36px e podem receber hit-area externa ampliada.
- Ícones Lucide: tamanhos 14/16/18px; stroke uniforme aproximado 1.8–2; decorativos com `aria-hidden`, funcionais com nome acessível.
- Layouts devem tolerar strings maiores de pt-BR, zoom, teclado e conteúdo variável; não forçar largura fixa de texto traduzido.
- Datas, contagens e percentuais continuam com `Intl`; nomes, conteúdo coletado e dados originais não passam por tradução.
- Logo Scout é ativo oficial, nunca se aplica filtro, máscara, tint ou alteração de proporção.

## 4. Especificação da fundação aprovada (Fase 2)

Valores normativos da fundação, substituindo números anteriores conflitantes neste documento:

| Área | Decisão Scout |
|---|---|
| Sidebar desktop | 236px |
| Padding horizontal de página | Desktop 32px; mobile 16px |
| Largura máxima do conteúdo | 1600px |
| Padding padrão de card | 16px |
| Raios | card/superfície/tabela 18px; diálogo 24px; superfície interna concêntrica 14–16px; menu 12px; controle 10px; ícone 8px; badge/switch circular |
| Botão / input / select | 36px de altura visual padrão |
| KPI | mínimo 112px; valor 28px/600 tabular |
| Linha de tabela | 48px, expansível para o conteúdo |
| Touch target | 44px sempre que possível |
| Tipografia | página 24/600; seção 16/600; card 14/500; corpo 14/400; controle 13/500; metadata 12/400 |
| Fonte | Inter existente, com fallback atual |
| Ação primária | `#278050`; hover `#226C43`; texto branco |
| Marca | `#2E8B57`, para identidade; contraste insuficiente para botão com texto branco |

Tokens CSS vivem em `:root` e serão implementados sem exigir migração global. Os nomes `--color-*` das tabelas desta especificação correspondem à família implementada `--scout-*` (por exemplo, `--color-action` → `--scout-action`). Tokens legados (`--ink`, `--muted`, `--line`, `--surface`, `--brand`, `--focus` e semânticos) permanecem como aliases temporários. Componentes novos usam tokens `--scout-*` e classes namespaced `ds-*`.

Primitivos da Fase 2: `Button`, `IconButton`, `Card`/`Surface`, `Input`, `Select`, `Field`, `Badge`, `Checkbox`, `Switch`, `EmptyState` e `Skeleton`. Devem preservar props HTML nativas e refs quando aplicável, sem substituir componentes de domínio existentes.

Uma galeria interna pode ser aberta por `?design-system=1`, sem item no menu de produção, usando somente conteúdo sintético. A alternância de idioma da galeria é local e não grava a preferência real do aplicativo.

## 5. Convenções para implementação futura

1. Tokens vivem em `src/styles.css` dentro de `:root`; usar nomes semânticos e componentes consomem tokens, não hex direto.
2. Cores semânticas ficam numa família diferente dos tokens de marca.
3. Novos componentes visuais devem usar variantes documentadas; evitar classes ad hoc por página quando o padrão for compartilhado.
4. Classes de layout (`page-container`, `page-header`, `stack`, `cluster`, `grid`) ficam separadas das classes de componente (`card`, `button`, `field`, `badge`).
5. CSS de página deve conter somente diferenças reais de composição ou domínio. Evitar redefinir botão/card globalmente dentro da página.
6. CSS de componente fica próximo da folha compartilhada até uma migração aprovada para módulos; não introduzir novo sistema de estilos nem dependência nesta consolidação.
7. Preservar classes/domínio e contratos operacionais; migração visual não altera estados, handlers, dados nem semântica.
8. Textos de UI passam pelo sistema de i18n atual. Conteúdo fornecido por usuário ou coletado fica fora do tradutor.

## 6. Plano incremental de migração

### Etapa A — Fundação e inventário (aprovação desta proposta)

- Confirmar esta escala e os breakpoints com revisão visual do Scout.
- Catalogar as regras ativas por componente e detectar cores de marca antigas, separando-as das semânticas.
- Manter o CSS existente como referência durante a transição; sem limpeza ampla inicial.

### Etapa B — Tokens e primitivas

- Expandir tokens CSS de cor, tipografia, espaço, raio, sombra, altura de controle e layout.
- Padronizar Button, Field, Badge, Card, EmptyState e foco.
- Trocar primeiro as regras globais mais seguras, preservando variantes semânticas.

### Etapa C — Container e componentes comuns

- Aplicar PageContainer/PageHeader à moldura já existente.
- Consolidar MetricCard, TableShell, FilterBar e Dialog.
- Migrar semântica e acessibilidade dos estados; eliminar duplicação apenas conforme componente substituído.

### Etapa D — Migração por página

1. Dashboard (baseline de cards e largura).
2. Campanhas e detalhes.
3. Pesquisa (formulários e resumo responsivo).
4. Envios (tabela, status e modais).
5. CRM (colunas/scroll independentes permanecem intactos).
6. Configurações e componentes auxiliares.

Para cada página: comparar desktop/tablet/mobile, pt-BR/en-US, verificar overflow, foco/teclado, estados vazios/carregamento/erro e confirmar que handlers/dados permaneceram iguais.

### Etapa E — Remoção gradual de legado

- Apagar regras antigas apenas depois que o seletor não tiver consumidores e a tela tiver sido verificada.
- Agrupar media queries por breakpoint ou componente, sem reformatar a folha inteira de uma vez.
- Manter exceções de visualização justificadas e documentadas.

### Critérios de conclusão

- Páginas usam container e escalas compartilhados.
- Componentes equivalentes têm mesma altura, padding, raio, tipografia e estados.
- Marca verde e status semânticos continuam distintos.
- Sem overflow horizontal inesperado em 320px–desktop.
- i18n, navegação e operações permanecem intactas.
- Regras duplicadas foram removidas de maneira comprovada e incremental.

## 7. Fase 3 — layout global e componentes compartilhados

A moldura compartilhada usa `AppShell` com `Sidebar`, `PageContainer` e `PageHeader`; `SectionHeader` padroniza títulos de blocos. A sidebar desktop mede 236px. O container central possui até 1600px, gutters laterais de 32px no desktop e 16px no mobile, e centraliza o eixo comum de cabeçalhos, conteúdo, cards e tabelas. A sidebar pode usar seu modo compacto responsivo em tablet e o menu móvel existente em telas estreitas.

Primitivos compartilhados disponíveis em `src/design-system.tsx`. Campos usam borda verde e halo suave ao foco; o foco por teclado mantém contorno sólido e visível. Botões desabilitados usam superfície e texto neutros, e textos auxiliares mantêm peso 400. Variantes de botão têm rótulos distintos na galeria.

Primitivos compartilhados:

- `MetricCard` e `MetricGrid`: KPI com 112px mínimos, padding 16px, raio 18px e número tabular de 28px.
- `TableShell`: região rolável com rótulo acessível; tabela com linhas mínimas de 48px, separadores, hover e rolagem horizontal interna.
- `Toolbar` e `FilterBar`: slots para busca, filtros, ações e filtros ativos; quebram em telas menores.
- `Tabs`: tabs controladas com `role=tablist`, seleção, foco roving e teclas de seta/Home/End; cada uso fornece `idPrefix` e painel associado.
- `Dialog`: elemento HTML nativo `<dialog>` em portal, com `showModal()`, Escape, foco inicial/restaurado, backdrop clicável, cabeçalho e rodapé fixos durante a rolagem interna.

A galeria `?design-system=1` mostra exemplos sintéticos em português e inglês. Ela não é adicionada à navegação de produção. Os componentes compartilhados estão disponíveis, mas as páginas de domínio ainda preservam seus componentes e estilos atuais nesta fase; a migração é gradual e fica para a Fase 4.

## 8. Fase 4.1 — raios globais e migração do Dashboard

Os tokens de raio são a fonte única dos cantos dos componentes novos. Os estilos legados de superfícies compartilhadas são mapeados por papel para a escala oficial enquanto cada tela passa pela migração; não substituir valores hexadecimais nem ajustar elementos sem relação de superfície indiscriminadamente.

O Dashboard adota `MetricGrid`/`MetricCard` nos indicadores, `Card`/`SectionHeader` nas seções e `TableShell` nas pesquisas recentes. Seus dados, cálculos, estados vazios/carregamento, status e handlers permanecem os existentes. Cards de campanhas ativas usam `--scout-radius-surface-inner` porque estão aninhados na superfície principal com inset próprio.

A galeria `?design-system=1` inclui uma demonstração sintética dos cantos concêntricos (18px externo, 16px após inset de 2px e 14px após inset acumulado de 4px), nos dois idiomas.
