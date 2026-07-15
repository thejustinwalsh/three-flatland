// basisu_thread_stubs.h — flatland-patch
// No-op stubs for std::mutex and std::condition_variable used by the BasisU encoder
// when compiled under WASI (_LIBCPP_HAS_NO_THREADS).
//
// std::lock_guard and std::unique_lock are templated and are still provided by
// libc++ even without threads, so we must NOT redefine them here.
//
// Included from basisu_enc.h so all encoder TUs pick it up automatically.
#pragma once
#ifdef _LIBCPP_HAS_NO_THREADS

namespace std {

// Minimal no-op mutex compatible with std::lock_guard<std::mutex>.
struct mutex {
    constexpr mutex() noexcept = default;
    ~mutex() = default;
    mutex(const mutex&) = delete;
    mutex& operator=(const mutex&) = delete;
    void lock() {}
    void unlock() {}
    bool try_lock() { return true; }
};

// No-op condition_variable — the encoder only calls wait/notify under a job_pool
// which is itself stubbed out for single-threaded WASI builds.
struct condition_variable {
    void notify_one() {}
    void notify_all() {}
    template <class Lock> void wait(Lock&) {}
    template <class Lock, class Pred> void wait(Lock&, Pred&&) {}
    template <class Lock, class Rep, class Period, class Pred>
    bool wait_for(Lock&, const void*, Pred&&) { return true; }
};

namespace this_thread {
    inline void yield() {}
}

} // namespace std

#endif // _LIBCPP_HAS_NO_THREADS
