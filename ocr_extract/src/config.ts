/**
 * Global application configuration.
 */

export const APP_NAME = "IntelliExtract";
export const APP_SUBTITLE = "ASISTENCIA OCR";
export const MASTER_DATA_URL = "https://docs.google.com/spreadsheets/d/1OqjJIobnbR7GrsM8AemQNTUtZcX-opcJFq2fh4mzqEI/export?format=csv&gid=0";

// La lectura de las fichas es 100 % local (ver src/lib/ocrLocal.ts): no hay modelos
// remotos, claves ni cuotas que configurar. El modelo OCR que se usa y de dónde se
// descarga al compilar está en src/lib/ocr/modelos.json.
