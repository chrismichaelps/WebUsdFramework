/**
 * Name Utilities
 * 
 * Utilities for sanitizing and generating names for USD paths.
 */

import { NAME_SANITIZATION_PATTERN } from '../constants/usd';

/**
 * Sanitizes a name for use in USD paths
 * 
 * USD paths only allow alphanumeric characters and underscores.
 * All other characters are replaced with underscores.
 */
export function sanitizeName(name: string): string {
  return name.replace(NAME_SANITIZATION_PATTERN, '_');
}

/**
 * Generates a random node name
 */
export function generateRandomNodeName(prefix: string = 'Node'): string {
  const randomId = Math.random().toString(36).substr(2, 9);
  return `${prefix}_${randomId}`;
}

