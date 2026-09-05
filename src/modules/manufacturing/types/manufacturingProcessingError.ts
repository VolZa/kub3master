export interface ManufacturingProcessingError {
  rowNumber: number;
  productCode: string;
  houseCode: string;
  reason:
    | 'HOUSE_NOT_FOUND'
    | 'PROJECT_DOCUMENT_NOT_FOUND'
    | 'PRODUCT_NOT_FOUND'
    | 'PRODUCT_DOCUMENT_NOT_FOUND';
}
