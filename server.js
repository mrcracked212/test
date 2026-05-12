const express = require("express");
const path = require("path");
const { performance } = require("perf_hooks");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function calculateStats(results) {
  const successResults = results.filter((r) => r.success);
  const failedResults = results.filter((r) => !r.success);

  const times = successResults.map((r) => r.responseTimeMs).sort((a, b) => a - b);

  const totalTime = times.reduce((sum, time) => sum + time, 0);
  const average = times.length > 0 ? totalTime / times.length : 0;

  let median = 0;
  if (times.length > 0) {
    const middle = Math.floor(times.length / 2);
    if (times.length % 2 === 0) {
      median = (times[middle - 1] + times[middle]) / 2;
    } else {
      median = times[middle];
    }
  }

  return {
    totalRequests: results.length,
    successRequests: successResults.length,
    failedRequests: failedResults.length,
    successRate:
      results.length > 0
        ? ((successResults.length / results.length) * 100).toFixed(2)
        : "0.00",
    minMs: times.length > 0 ? Math.min(...times).toFixed(2) : 0,
    maxMs: times.length > 0 ? Math.max(...times).toFixed(2) : 0,
    averageMs: average.toFixed(2),
    medianMs: median.toFixed(2)
  };
}

async function accessUrl(url, index) {
  const start = performance.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Local-Web-Tester/1.0"
      }
    });

    const end = performance.now();
    const responseTimeMs = end - start;

    return {
      no: index,
      success: response.ok,
      url,
      statusCode: response.status,
      statusText: response.statusText,
      responseTimeMs: Number(responseTimeMs.toFixed(2)),
      error: null,
      time: new Date().toLocaleString()
    };
  } catch (error) {
    const end = performance.now();
    const responseTimeMs = end - start;

    return {
      no: index,
      success: false,
      url,
      statusCode: null,
      statusText: "FAILED",
      responseTimeMs: Number(responseTimeMs.toFixed(2)),
      error: error.message,
      time: new Date().toLocaleString()
    };
  }
}

app.post("/api/test", async (req, res) => {
  try {
    const { url, totalRequests, concurrency, delayMs } = req.body;

    if (!url || !isValidUrl(url)) {
      return res.status(400).json({
        success: false,
        message: "URL tidak valid. Gunakan URL lengkap seperti https://example.com"
      });
    }

    const total = Number(totalRequests);
    const concurrent = Number(concurrency);
    const delay = Number(delayMs);

    if (!total || total < 1 || total > 1000) {
      return res.status(400).json({
        success: false,
        message: "Jumlah akses minimal 1 dan maksimal 1000."
      });
    }

    if (!concurrent || concurrent < 1 || concurrent > 20) {
      return res.status(400).json({
        success: false,
        message: "Concurrency minimal 1 dan maksimal 20 agar aman untuk testing."
      });
    }

    if (delay < 0 || delay > 10000) {
      return res.status(400).json({
        success: false,
        message: "Delay minimal 0 dan maksimal 10000 ms."
      });
    }

    const results = [];
    let currentIndex = 1;

    while (currentIndex <= total) {
      const batch = [];

      for (let i = 0; i < concurrent && currentIndex <= total; i++) {
        batch.push(accessUrl(url, currentIndex));
        currentIndex++;
      }

      const batchResults = await Promise.all(batch);
      results.push(...batchResults);

      if (currentIndex <= total && delay > 0) {
        await sleep(delay);
      }
    }

    const stats = calculateStats(results);

    return res.json({
      success: true,
      message: "Testing selesai.",
      testedUrl: url,
      stats,
      results
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server.",
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Web Access Tester berjalan di http://localhost:${PORT}`);
});
