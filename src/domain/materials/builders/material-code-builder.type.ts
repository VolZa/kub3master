/**
 * ==========================================================
 * ERP КУБ
 * Module: Elements
 * File: material-code-builder.type.ts
 * Path: src/modules/elements/builders/material-code-builder.type.ts
 *
 * Формує канонічний Code матеріалу на основі Parsed/BuiltElement.
 * ==========================================================
 */

import { BuiltElement } from '../../../domain/elements/built-element.model';

export type MaterialCodeBuilder = (element: BuiltElement) => string;
