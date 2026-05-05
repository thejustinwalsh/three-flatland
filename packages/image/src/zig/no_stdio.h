// no_stdio.h — force-included by build.zig into every basisu translation
// unit to redirect C stdio to no-ops, which prevents wasm-ld from pulling
// in libc's printf/fprintf/etc. and the WASI fd_write/path_open/environ_*
// imports those depend on. Saves a few hundred KB of libc machinery
// (format-string parsers, locale init, FILE* state) we never use because
// the basisu ENG runs headless inside the wasm sandbox with no console.
//
// Strictly defines macros — does not redeclare prototypes — so the
// underlying <stdio.h> can still be included afterwards by basisu code
// that needs FILE* types or fopen/fread/fwrite (those code paths are
// dead-code eliminated when no caller in our exported subgraph reaches
// them).

#pragma once

#include <stdio.h>

#define printf(...)   ((int)0)
#define fprintf(...)  ((int)0)
#define vprintf(...)  ((int)0)
#define vfprintf(...) ((int)0)
#define puts(...)     ((int)0)
#define fputs(...)    ((int)0)
#define fputc(...)    ((int)0)
#define putchar(...)  ((int)0)
#define perror(...)   ((void)0)
