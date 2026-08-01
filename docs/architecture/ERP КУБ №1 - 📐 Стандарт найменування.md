📐 Стандарт найменування ERP КУБ №1

<!--
Суфікс	    Призначення	                        Приклад
Key	        Логічний ідентифікатор	            SheetKey, SpreadsheetKey, ElementType
Definition	Статичний опис конфігурації	        SheetDefinition, SpreadsheetDefinition
Config	    Колекція визначень	                SheetConfig, SpreadsheetConfig
Provider	Отримує ресурс	                    SheetProvider, SpreadsheetProvider
Registry	Керує екземплярами та кешем	        SpreadsheetRegistry
DataSource	Працює з фізичним джерелом даних	GoogleSheetsCatalogDataSource
Repository	Працює з доменними моделями	        CatalogRepository
Service	    Бізнес-логіка	                    ProductReportDataService
Builder	    Будує модель або структуру	        SheetReportRowBuilder
Reader	    Читає дані	                        ProductionReader
Writer	    Записує дані	                    ShopReportWriter
 -->

Рівень 1 — книги

<!--
SpreadsheetKey
        │
SpreadsheetDefinition
        │
SpreadsheetConfig
        │
SpreadsheetProvider
        │
SpreadsheetRegistry
Рівень 2 — аркуші
SheetKey
        │
SheetDefinition
        │
SheetConfig
        │
SheetProvider -->

Бачиш, наскільки вони симетричні?

Саме це я хочу зробити фірмовим стилем ERP КУБ.

📐 Стандарт архітектури ERP КУБ №1

Кожен інфраструктурний ресурс будується за однаковим шаблоном:

<!--
       Key
        ↓
    Definition
        ↓
    Config
        ↓
    Provider
       ↓
    Registry (за потреби) -->

Не тільки Spreadsheet.

У майбутньому так само можна буде зробити:

ReportKey
ReportDefinition
ReportConfig
ReportProvider

або

TemplateKey
TemplateDefinition
TemplateConfig
TemplateProvider

Тобто архітектура стане передбачуваною.
