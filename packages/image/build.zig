const std = @import("std");

pub fn build(b: *std.Build) void {
    var query: std.Target.Query = .{ .cpu_arch = .wasm32, .os_tag = .wasi };
    query.cpu_features_add = std.Target.wasm.featureSet(&.{
        .simd128, .bulk_memory, .sign_ext, .nontrapping_fptoint,
    });
    const target = b.resolveTargetQuery(query);
    const optimize = b.standardOptimizeOption(.{});

    const exe = b.addExecutable(.{
        .name = "basis_encoder",
        .root_module = b.createModule(.{ .target = target, .optimize = optimize }),
    });
    exe.entry = .disabled;
    exe.rdynamic = true;
    exe.export_table = true;
    exe.initial_memory = 32 * 1024 * 1024;
    exe.max_memory = 512 * 1024 * 1024;

    exe.addCSourceFile(.{
        .file = b.path("src/zig/hello.c"),
        .flags = &.{ "-std=c11", "-nostdlib" },
    });

    const install = b.addInstallFile(exe.getEmittedBin(), "../vendor/basis/basis_encoder.wasm");
    b.getInstallStep().dependOn(&install.step);
}
