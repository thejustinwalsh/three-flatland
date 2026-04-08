/*
 * WASM setjmp/longjmp runtime — implements the ABI expected by LLVM's
 * WebAssemblyLowerEmscriptenEHSjLj pass when -mllvm -wasm-enable-sjlj is used.
 *
 * Source: wasi-libc (MIT license)
 * https://github.com/WebAssembly/wasi-libc/blob/main/libc-top-half/musl/src/setjmp/wasm32/rt.c
 */

#include <stddef.h>
#include <stdint.h>

void __wasm_setjmp(void *env, uint32_t label, void *func_invocation_id);
uint32_t __wasm_setjmp_test(void *env, void *func_invocation_id);
void __wasm_longjmp(void *env, int val);

struct jmp_buf_impl {
    void *func_invocation_id;
    uint32_t label;
    struct arg {
        void *env;
        int val;
    } arg;
};

void
__wasm_setjmp(void *env, uint32_t label, void *func_invocation_id)
{
    struct jmp_buf_impl *jb = env;
    if (label == 0) __builtin_trap();
    if (func_invocation_id == NULL) __builtin_trap();
    jb->func_invocation_id = func_invocation_id;
    jb->label = label;
}

uint32_t
__wasm_setjmp_test(void *env, void *func_invocation_id)
{
    struct jmp_buf_impl *jb = env;
    if (jb->label == 0) __builtin_trap();
    if (func_invocation_id == NULL) __builtin_trap();
    if (jb->func_invocation_id == func_invocation_id) {
        return jb->label;
    }
    return 0;
}

void
__wasm_longjmp(void *env, int val)
{
    struct jmp_buf_impl *jb = env;
    struct arg *arg = &jb->arg;
    if (val == 0) val = 1;
    arg->env = env;
    arg->val = val;
    __builtin_wasm_throw(1, arg); /* 1 == C_LONGJMP */
}

/* Define the __c_longjmp WebAssembly exception tag */
__asm__(".globl __c_longjmp\n"
        ".tagtype __c_longjmp i32\n"
        "__c_longjmp:\n");
