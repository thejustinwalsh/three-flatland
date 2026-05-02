// basisu_opencl_stub.cpp — flatland-patch
// No-op stub for the OpenCL encoder acceleration path.
// The original basisu_opencl.cpp was removed at vendor time (see README.flatland.md).
// These stubs satisfy the linker for builds that include basisu_opencl.h.
// All functions return false / nullptr, which causes the encoder to fall back to CPU.
#include "basisu_opencl.h"

namespace basisu
{
	bool opencl_init(bool) { return false; }
	void opencl_deinit() {}
	bool opencl_is_available() { return false; }

	opencl_context_ptr opencl_create_context() { return nullptr; }
	void opencl_destroy_context(opencl_context_ptr) {}

	bool opencl_set_pixel_blocks(opencl_context_ptr, size_t, const cl_pixel_block*) { return false; }
	bool opencl_encode_etc1s_blocks(opencl_context_ptr, etc_block*, bool, uint32_t) { return false; }
	bool opencl_encode_etc1s_pixel_clusters(opencl_context_ptr, etc_block*, uint32_t,
		const cl_pixel_cluster*, uint64_t, const color_rgba*, const uint32_t*, bool, uint32_t) { return false; }
	bool opencl_refine_endpoint_clusterization(opencl_context_ptr, const cl_block_info_struct*,
		uint32_t, const cl_endpoint_cluster_struct*, const uint32_t*, uint32_t*, bool) { return false; }
	bool opencl_find_optimal_selector_clusters_for_each_block(opencl_context_ptr,
		const fosc_block_struct*, uint32_t, const fosc_selector_struct*,
		const uint32_t*, uint32_t*, bool) { return false; }
	bool opencl_determine_selectors(opencl_context_ptr, const color_rgba*, etc_block*, bool) { return false; }
} // namespace basisu
