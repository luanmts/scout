# Diagnóstico de cobertura por job

`GET /api/searches/:id/coverage` compara os artefatos locais de cada job concluído:

- `rawRows`: linhas do CSV baixado pelo Scout Engine;
- `processorUniqueRows` e `processorDuplicatesRemoved`: normalização local;
- `retainedRows`, `limit` e `limitedOut`: limite aplicado pelo `prepare-leads.mjs`;
- `sqliteLinks` e `sqliteUniqueLeads`: vínculos e leads realmente persistidos.

`IMPORT_LEAD_LIMIT` controla o teto local por job. O padrão é 250 e o máximo seguro é 1.000. Ele não altera a extração do scraper upstream nem reprocessa CSVs antigos.

Uma pesquisa estadual como `Hair Salons in California, United States` é uma consulta textual ampla do Maps. Ela não divide o estado em cidades ou uma grade geográfica. A cobertura é limitada pela resposta do Maps e pelos parâmetros do job, especialmente `depth` (profundidade máxima de scroll), `zoom` e `max_time`. Para maior cobertura, use pesquisas explícitas por cidades ou regiões menores e avalie os diagnósticos por job antes de aumentar `depth`.
