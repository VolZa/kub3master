# TEST Runtime v1.3 — source access inventory

Static search includes comments and administrative source-inspection routes; classification is in TEST_RUNTIME_V13.md.

```text
src\admin\test-runtime\runtime.ts:7:  sheets: Pick<typeof SpreadsheetApp, 'openById'>) {
src\admin\test-runtime\runtime.ts:12:      const target = resolver.target(role), book = sheets.openById(target.id);
src\app\factories\bom-expansion.factory.ts:14:import { sheetProvider } from './infrastructure.factory';
src\app\factories\bom-expansion.factory.ts:19:  const materials = new MaterialRepository(new GoogleSheetsMaterialDataSource(sheetProvider).getRows());
src\app\factories\bom-matrix-columns.factory.ts:6:import { sheetProvider } from './infrastructure.factory'; //'../../infrastructure/sheets/SheetProvider';
src\app\factories\bom-matrix-columns.factory.ts:13:      sheetProvider,
src\core\bootstrap\repositories.ts:16:import { sheetProvider } from '../../app/factories/infrastructure.factory';
src\core\bootstrap\repositories.ts:23:  const materialDS = new GoogleSheetsMaterialDataSource(sheetProvider);
src\core\bootstrap\repositories.ts:56:// import { sheetProvider } from '../../app/factories/infrastructure.factory';
src\core\bootstrap\repositories.ts:65://   const materialDS = new GoogleSheetsMaterialDataSource(sheetProvider);
src\app\factories\catalog.factory.ts:3:import { sheetProvider } from './infrastructure.factory';
src\app\factories\catalog.factory.ts:9:    const dataSource = new GoogleSheetsCatalogDataSource(sheetProvider);
src\app\entrypoints\material-report-control.entrypoints.ts:28:    const sheet = SpreadsheetApp.openById(REPORTING_ID).getSheets().find(s => s.getSheetId() === receipt.sheetId)!;
src\app\entrypoints\material-report-control.entrypoints.ts:47:    const book = SpreadsheetApp.openById(config.id);
src\app\entrypoints\material-report-control.entrypoints.ts:66:    const book = SpreadsheetApp.openById(config.id);
src\app\factories\house.factory.ts:14:import { sheetProvider } from './infrastructure.factory';
src\app\factories\house.factory.ts:20:    const dataSource = new GoogleSheetsHouseDataSource(sheetProvider);
src\app\entrypoints\manufacturing.entrypoints.ts:26:    SpreadsheetApp.getActive().toast(
src\app\entrypoints\manufacturing.entrypoints.ts:36:    SpreadsheetApp.getActive().toast(message, 'Помилка', 8);
src\app\entrypoints\manufacturing.entrypoints.ts:45:  const ui = SpreadsheetApp.getUi();
src\app\factories\manufacturing-buffer-creation.factory.ts:13:import { sheetProvider } from './infrastructure.factory';
src\app\factories\manufacturing-buffer-creation.factory.ts:29:      sheetProvider,
src\app\factories\manufacturing-buffer-creation.factory.ts:41:// import { sheetProvider } from './infrastructure.factory';
src\app\factories\manufacturing-buffer-creation.factory.ts:77://     const writer = new GoogleSheetsWriter(sheetProvider);
src\app\factories\manufacturing-buffer-creation.factory.ts:87://       sheetProvider,
src\app\factories\infrastructure.factory.ts:2:import { SpreadsheetProvider } from '../../infrastructure/spreadsheets/SpreadsheetProvider';
src\app\factories\infrastructure.factory.ts:6:const spreadsheetProvider = new SpreadsheetProvider();
src\app\factories\infrastructure.factory.ts:8:const spreadsheetRegistry = new SpreadsheetRegistry(spreadsheetProvider);
src\app\factories\infrastructure.factory.ts:10:const sheetProvider = new SheetProvider(spreadsheetRegistry);
src\app\factories\infrastructure.factory.ts:12:export { spreadsheetProvider, spreadsheetRegistry, sheetProvider };
src\app\factories\manufacturing-sync-state.factory.ts:6:import { sheetProvider } from './infrastructure.factory';
src\app\factories\manufacturing-sync-state.factory.ts:13:      sheetProvider,
src\app\factories\manufacturing-creation.factory.ts:19:import { sheetProvider } from './infrastructure.factory';
src\app\factories\manufacturing-creation.factory.ts:57:    const writer = new GoogleSheetsWriter(sheetProvider);
src\admin\test-reset\spreadsheet-risk-inspector.ts:3:export function gasSpreadsheetInspector(api: Pick<typeof SpreadsheetApp, 'openById'>, maxCells = 250000, hash?: (text: string) => string): SpreadsheetPort {
src\admin\test-reset\spreadsheet-risk-inspector.ts:5:    const book = api.openById(fileId), sheets = book.getSheets(), hazards: string[] = [];
src\admin\test-reset\gas-test-reset.ts:9:  spreadsheets: Pick<typeof SpreadsheetApp, 'openById'>;
src\admin\test-reset\gas-test-reset.ts:44:/** Documented evidence shape only; a successful SpreadsheetApp.openById is NOT a safety audit. */
src\app\factories\manufacturing.factory.ts:17:import { sheetProvider } from './infrastructure.factory';
src\app\factories\manufacturing.factory.ts:23:    const dataSource = new GoogleSheetsManufacturingDataSource(sheetProvider);
src\app\factories\material.factory.ts:4:import { sheetProvider } from './infrastructure.factory';
src\app\factories\material.factory.ts:10:    const dataSource = new GoogleSheetsMaterialDataSource(sheetProvider);
src\app\factories\materialBatch.factory.ts:4:import { sheetProvider } from './infrastructure.factory';
src\app\factories\materialBatch.factory.ts:10:    const dataSource = new GoogleSheetsMaterialBatchDataSource(sheetProvider);
src\app\factories\placement.factory.ts:7:import { sheetProvider } from './infrastructure.factory';
src\app\factories\placement.factory.ts:13:    const dataSource = new GoogleSheetsPlacementDataSource(sheetProvider);
src\app\factories\project-document-dependency.factory.ts:14:import { sheetProvider } from './infrastructure.factory';
src\app\factories\project-document-dependency.factory.ts:24:      sheetProvider,
src\app\factories\project-document.factory.ts:13:import { sheetProvider } from './infrastructure.factory';
src\app\factories\project-document.factory.ts:20:    const dataSource = new GoogleSheetsProjectDocumentDataSource(sheetProvider);
src\app\factories\project-material-matrix-report.factory.ts:8:import { sheetProvider } from './infrastructure.factory';
src\app\factories\project-material-matrix-report.factory.ts:53:  const writer = new ProjectMaterialMatrixWriter(sheetProvider);
src\admin\test-reset\admin-entrypoints.ts:26:    sourceFile: id => { const file = DriveApp.getFileById(id); return { id: file.getId(), mimeType: file.getMimeType(), trashed: file.isTrashed() }; },
src\app\factories\project.factory.ts:14:import { sheetProvider } from './infrastructure.factory';
src\app\factories\project.factory.ts:20:    const dataSource = new GoogleSheetsProjectDataSource(sheetProvider);
src\app\factories\shift-plan-item.factory.ts:5:import { sheetProvider } from './infrastructure.factory';
src\app\factories\shift-plan-item.factory.ts:14:    const dataSource = new GoogleSheetsShiftPlanItemDataSource(sheetProvider);
src\app\factories\shift-plan-item.factory.ts:25:// import { sheetProvider } from './infrastructure.factory';
src\app\factories\shift-plan-item.factory.ts:31://     const dataSource = new GoogleSheetsShiftPlanItemDataSource(sheetProvider);
src\app\factories\shift-plan.factory.ts:6:import { sheetProvider } from './infrastructure.factory';
src\app\factories\shift-plan.factory.ts:15:    const dataSource = new GoogleSheetsShiftPlanDataSource(sheetProvider);
src\utils\sheets.ts:4:  const ss = SpreadsheetApp.getActive();
src\infrastructure\sheets\bom\GoogleSheetsBOMMatrixColumnsDataSource.ts:12:  constructor(sheetProvider: SheetProvider) {
src\infrastructure\sheets\bom\GoogleSheetsBOMMatrixColumnsDataSource.ts:14:      sheetProvider,
src\infrastructure\spreadsheets\SpreadsheetRegistry.ts:1:import { SpreadsheetProvider } from './SpreadsheetProvider';
src\infrastructure\spreadsheets\SpreadsheetRegistry.ts:4:  constructor(provider: RegistryProvider = new SpreadsheetProvider()) { super(provider); }
src\infrastructure\spreadsheets\SpreadsheetRegistry.ts:6:export const spreadsheetRegistry = new SpreadsheetRegistry();
src\infrastructure\spreadsheets\SpreadsheetProvider.ts:4:export class SpreadsheetProvider {
src\infrastructure\spreadsheets\SpreadsheetProvider.ts:8:    return SpreadsheetApp.openById(info.id);
src\infrastructure\sheets\catalog\GoogleSheetsCatalogDataSource.ts:11:  constructor(sheetProvider: SheetProvider) {
src\infrastructure\sheets\catalog\GoogleSheetsCatalogDataSource.ts:12:    super(sheetProvider, SheetKey.CATALOG, CATALOG_HEADERS);
src\services\sheets.service.ts:45://   const ss = SpreadsheetApp.getActive();
src\infrastructure\reporting\project-material-matrix-writer.ts:6:  constructor(private readonly sheetProvider: SheetProvider) {}
src\infrastructure\reporting\project-material-matrix-writer.ts:24:    return this.sheetProvider.get(SheetKey.REPORT_MATERIAL_MATRIX);
src\services\cache.service.ts:27://     SpreadsheetApp.getActive().getSheetByName('00_Elements');
src\utils\id.ts:8:import { SpreadsheetProvider } from '../infrastructure/spreadsheets/SpreadsheetProvider';
src\utils\id.ts:57:    const ss = new SpreadsheetProvider().open(SpreadsheetKey.MASTER);
src\utils\id.ts:66:    SpreadsheetApp.flush();
src\main.ts:5:  const ui = SpreadsheetApp.getUi();
src\main.ts:33://   const ui = SpreadsheetApp.getUi();
src\infrastructure\reporting\gas-saved-report-store.ts:10:  protected book() { return SpreadsheetApp.openById(REPORTING_ID); }
src\infrastructure\reporting\gas-saved-report-store.ts:47:      index.setFrozenRows(1); SpreadsheetApp.flush();
src\infrastructure\reporting\gas-saved-report-store.ts:72:    copy.setName(attempt.report.sheetName); SpreadsheetApp.flush();
src\infrastructure\reporting\gas-saved-report-store.ts:77:    copy.addDeveloperMetadata(HASH_KEY, hash); SpreadsheetApp.flush();
src\infrastructure\reporting\gas-saved-report-store.ts:91:    SpreadsheetApp.flush();
src\infrastructure\reporting\gas-archive-management-store.ts:44:    this.sheet(entry.sheetId).setName(name); SpreadsheetApp.flush();
src\infrastructure\reporting\gas-archive-management-store.ts:60:    index.getRange(row, 3).setNumberFormat('@').setValue(name); SpreadsheetApp.flush();
src\infrastructure\reporting\gas-archive-management-store.ts:66:    this.book().deleteSheet(this.sheet(entry.sheetId)); SpreadsheetApp.flush();
src\infrastructure\reporting\gas-archive-management-store.ts:70:    const { index, row } = this.indexRow(entry); index.deleteRow(row); SpreadsheetApp.flush();
src\infrastructure\sheets\manufacturing\GoogleSheetsManufacturingDataSource.ts:9:  constructor(sheetProvider: SheetProvider) {
src\infrastructure\sheets\manufacturing\GoogleSheetsManufacturingDataSource.ts:10:    super(sheetProvider, SheetKey.MANUFACTURING, MANUFACTURING_HEADERS, 3, 12);
src\infrastructure\reporting\current-report-writer.ts:82:  private book() { return this.spreadsheet ?? (this.spreadsheet = SpreadsheetApp.openById(REPORTING_ID)); }
src\infrastructure\reporting\current-report-writer.ts:118:    SpreadsheetApp.flush();
src\infrastructure\reporting\current-report-writer.ts:121:  rename(id: number, name: string) { this.sheet(id).setName(name); SpreadsheetApp.flush(); }
src\infrastructure\reporting\current-report-writer.ts:146:    SpreadsheetApp.flush();
src\infrastructure\sheets\manufacturing\GoogleSheetsManufacturingBufferReader.ts:26:  constructor(private readonly sheetProvider: SheetProvider) {}
src\infrastructure\sheets\manufacturing\GoogleSheetsManufacturingBufferReader.ts:29:    const sheet = this.sheetProvider.get(SheetKey.MANUFACTURING);
src\infrastructure\sheets\house\GoogleSheetsHouseDataSource.ts:21:  constructor(sheetProvider: SheetProvider) {
src\infrastructure\sheets\house\GoogleSheetsHouseDataSource.ts:22:    super(sheetProvider, SheetKey.HOUSES, HOUSE_HEADERS);
src\infrastructure\sheets\GoogleSheetsWriter.ts:18:  constructor(private readonly sheetProvider: SheetProvider) {}
src\infrastructure\sheets\GoogleSheetsWriter.ts:32:    const manufacturingSheet = this.sheetProvider.get(SheetKey.MANUFACTURING);
src\infrastructure\sheets\GoogleSheetsWriter.ts:34:    const toolingSheet = this.sheetProvider.get(SheetKey.TOOLING);
src\infrastructure\sheets\GoogleSheetsWriter.ts:60:    const sheet = this.sheetProvider.get(sheetKey);
src\infrastructure\sheets\GoogleSheetsWriter.ts:88:    const sheet = this.sheetProvider.get(sheetKey);
src\modules\bom\bom.repository.ts:5:import { SpreadsheetProvider } from '../../infrastructure/spreadsheets/SpreadsheetProvider';
src\modules\bom\bom.repository.ts:13:  const master = new SpreadsheetProvider().open(SpreadsheetKey.MASTER);
src\infrastructure\sheets\GoogleSheetsReader.ts:17:  constructor(private readonly sheetProvider: SheetProvider) {}
src\infrastructure\sheets\GoogleSheetsReader.ts:23:    return this.sheetProvider.get(sheetKey).getDataRange().getValues();
src\infrastructure\sheets\shift-plan-item\GoogleSheetsShiftPlanItemDataSource.ts:19:  constructor(sheetProvider: SheetProvider) {
src\infrastructure\sheets\shift-plan-item\GoogleSheetsShiftPlanItemDataSource.ts:20:    super(sheetProvider, SheetKey.SHIFT_PLAN_ITEMS, SHIFT_PLAN_ITEMS_HEADERS);
src\infrastructure\sheets\GoogleSheetsDataSource.ts:23:    sheetProvider: SheetProvider,
src\infrastructure\sheets\GoogleSheetsDataSource.ts:29:    this.reader = new GoogleSheetsReader(sheetProvider);
src\infrastructure\sheets\GoogleSheetsDataSource.ts:30:    this.writer = new GoogleSheetsWriter(sheetProvider);
src\infrastructure\sheets\shift-plan\GoogleSheetsShiftPlanDataSource.ts:19:  constructor(sheetProvider: SheetProvider) {
src\infrastructure\sheets\shift-plan\GoogleSheetsShiftPlanDataSource.ts:20:    super(sheetProvider, SheetKey.SHIFT_PLAN, SHIFT_PLAN_HEADERS);
src\ui\openForm.ts:8:  SpreadsheetApp.getUi().showSidebar(html);
src\ui\openForm.ts:17:  SpreadsheetApp.getUi().showSidebar(html);
src\infrastructure\sheets\SheetProvider.ts:9:    private readonly spreadsheetRegistry = new SpreadsheetRegistry(),
src\infrastructure\sheets\SheetProvider.ts:15:    const spreadsheet = this.spreadsheetRegistry.get(definition.spreadsheet);
src\infrastructure\sheets\SheetProvider.ts:27:export const sheetProvider = new SheetProvider();
src\infrastructure\sheets\project\GoogleSheetsProjectDataSource.ts:20:  constructor(sheetProvider: SheetProvider) {
src\infrastructure\sheets\project\GoogleSheetsProjectDataSource.ts:21:    super(sheetProvider, SheetKey.PROJECTS, PROJECT_HEADERS);
src\infrastructure\sheets\production\GoogleSheetsProductionDataSource.ts:19:  constructor(sheetProvider: SheetProvider) {
src\infrastructure\sheets\production\GoogleSheetsProductionDataSource.ts:20:    super(sheetProvider, SheetKey.PRODUCTION, PRODUCTION_HEADERS);
src\infrastructure\sheets\material\GoogleSheetsMaterialDataSource.ts:19:  constructor(sheetProvider: SheetProvider) {
src\infrastructure\sheets\material\GoogleSheetsMaterialDataSource.ts:20:    super(sheetProvider, SheetKey.MATERIALS, MATERIAL_HEADERS);
src\infrastructure\sheets\project-document-dependency\GoogleSheetsProjectDocumentDependencyDataSource.ts:22:  constructor(sheetProvider: SheetProvider) {
src\infrastructure\sheets\project-document-dependency\GoogleSheetsProjectDocumentDependencyDataSource.ts:24:      sheetProvider,
src\infrastructure\sheets\placement\GoogleSheetsPlacementDataSource.ts:19:  constructor(sheetProvider: SheetProvider) {
src\infrastructure\sheets\placement\GoogleSheetsPlacementDataSource.ts:20:    super(sheetProvider, SheetKey.PLACEMENT, PLACEMENT_HEADERS);
src\infrastructure\sheets\project-document\GoogleSheetsProjectDocumentDataSource.ts:20:  constructor(sheetProvider: SheetProvider) {
src\infrastructure\sheets\project-document\GoogleSheetsProjectDocumentDataSource.ts:21:    super(sheetProvider, SheetKey.PROJECT_DOCUMENTS, PROJECT_DOCUMENT_HEADERS);
src\infrastructure\sheets\material-batch\GoogleSheetsMaterialBatchDataSource.ts:9:  constructor(sheetProvider: SheetProvider) {
src\infrastructure\sheets\material-batch\GoogleSheetsMaterialBatchDataSource.ts:10:    super(sheetProvider, SheetKey.MATERIAL_BATCHES, MATERIAL_BATCH_HEADERS);
src\modules\elements\element.repository.ts:3:import { SpreadsheetProvider } from '../../infrastructure/spreadsheets/SpreadsheetProvider';
src\modules\elements\element.repository.ts:61:    const master = new SpreadsheetProvider().open(SpreadsheetKey.MASTER);
src\infrastructure\sheets\manufacturingSyncState\GoogleSheetsManufacturingSyncStateDataSource.ts:20:  constructor(sheetProvider: SheetProvider) {
src\infrastructure\sheets\manufacturingSyncState\GoogleSheetsManufacturingSyncStateDataSource.ts:22:      sheetProvider,
src\modules\bom\commit\commit-operation-journal.ts:8:import { SpreadsheetProvider } from '../../../infrastructure/spreadsheets/SpreadsheetProvider';
src\modules\bom\commit\commit-operation-journal.ts:80:    SpreadsheetApp.flush();
src\modules\bom\commit\commit-operation-journal.ts:370:  const master = new SpreadsheetProvider().open(SpreadsheetKey.MASTER);
src\modules\bom\commit\fresh-commit-context.ts:11:import { SpreadsheetProvider } from '../../../infrastructure/spreadsheets/SpreadsheetProvider';
src\modules\bom\commit\fresh-commit-context.ts:32:    const sheet = new SpreadsheetProvider().open(SpreadsheetKey.MASTER).getSheetByName(definition.name);
src\modules\bom\commit\safe-commit.service.ts:16:import { SpreadsheetProvider } from '../../../infrastructure/spreadsheets/SpreadsheetProvider';
src\modules\bom\commit\safe-commit.service.ts:31:  const master = new SpreadsheetProvider().open(SpreadsheetKey.MASTER);
src\modules\bom\commit\fresh-element-store.ts:7:import { SpreadsheetProvider } from '../../../infrastructure/spreadsheets/SpreadsheetProvider';
src\modules\bom\commit\fresh-element-store.ts:26:    const sheet = new SpreadsheetProvider().open(SpreadsheetKey.MASTER).getSheetByName('00_Elements');
src\modules\bom\commit\fresh-element-store.ts:57:    SpreadsheetApp.flush();
src\modules\manufacturing\migration\manufacturingInitialMigration.ts:17:import { sheetProvider } from '../../../app/factories/infrastructure.factory';
src\modules\manufacturing\migration\manufacturingInitialMigration.ts:22:  const sheet = sheetProvider.get(SheetKey.MANUFACTURING);
src\modules\bom\commit\safe-bom-writer.ts:7:import { SpreadsheetProvider } from '../../../infrastructure/spreadsheets/SpreadsheetProvider';
src\modules\bom\commit\safe-bom-writer.ts:175:    SpreadsheetApp.flush();
src\modules\bom\commit\safe-bom-writer.ts:258:        SpreadsheetApp.flush();
src\modules\bom\commit\safe-bom-writer.ts:280:    const master = new SpreadsheetProvider().open(SpreadsheetKey.MASTER);
src\modules\bom\commit\safe-bom-writer.ts:308:    const master = new SpreadsheetProvider().open(SpreadsheetKey.MASTER);
src\modules\bom\commit\safe-bom-writer.ts:318:  const master = new SpreadsheetProvider().open(SpreadsheetKey.MASTER);
src\modules\bom\commit\safe-bom-writer.ts:325:  return readBOM(requireSheet(new SpreadsheetProvider().open(SpreadsheetKey.MASTER), '01_BOM'));
src\modules\bom\commit\safe-bom-writer.ts:329:  const plan = normalizePlan(input), master = new SpreadsheetProvider().open(SpreadsheetKey.MASTER);
src\modules\productionJournal\productionJournal.service.ts:2:  const ss = SpreadsheetApp.getActive();
src\modules\productionJournal\productionJournal.service.ts:15:  const sheet = SpreadsheetApp.getActive().getSheetByName('03_Краби');
```
