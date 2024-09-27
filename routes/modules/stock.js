var express = require("express");
var router = express.Router();
// const data = require("./stock-data.json");
const { Op } = require("sequelize");

// const data = ("./stock-data-mins.json");
const path = require("path");
const data = require("./stock-data.json");
const fs = require("fs").promises;
const db = require("../../models");
const Correlation = db.Correlation;

router.get("/candlestickCharts/:stock1/:stock2", async (req, res, next) => {
  try {
    const today = new Date();
    const threeMonthsAgo = new Date(today);
    threeMonthsAgo.setMonth(today.getMonth() - 3);
    const formatDate = (date) => {
      return date.toISOString().slice(0, 10).replace(/-/g, "");
    };
    const stock1 = req.params.stock1;
    const stock2 = req.params.stock2;
    const filterStockData = (symbol) => {
      return data.filter(
        (item) =>
          item.symbol === symbol &&
          item.date >= formatDate(threeMonthsAgo) &&
          item.date <= formatDate(today)
      );
    };

    const correlationData = await Correlation.findOne({
      where: {
        stock1: stock1,
        stock2: stock2,
      },
    });

    if (!correlationData) {
      correlationData = await Correlation.findOne({
        where: {
          stock1: stock2,
          stock2: stock1,
        },
      });
    }

    let correlation = null;
    correlationData && (correlation = correlationData.correlation);

    res.json({
      stock1: filterStockData(stock1),
      stock2: filterStockData(stock2),
      // correlation: totalCorrelation,
      correlation: correlation,
    });
  } catch (error) {
    res.json("error");
  }
});

//////////////////////////////

// async function readStockData(filePath) {
//   const data = await fs.readFile(filePath, "utf8");
//   return JSON.parse(data);
// }
// 新增這個輔助函數來解析日期
function parseDate(dateString) {
  const year = parseInt(dateString.substring(0, 4));
  const month = parseInt(dateString.substring(4, 6)) - 1; // 月份從0開始
  const day = parseInt(dateString.substring(6, 8));
  return new Date(year, month, day);
}
function processStockData(data) {
  const stockMap = new Map();
  data.forEach((item) => {
    if (!stockMap.has(item.symbol)) {
      stockMap.set(item.symbol, []);
    }
    stockMap.get(item.symbol).push({
      date: parseDate(item.date),
      isIncrease: Math.sign(item.close - item.open),
    });
  });

  return stockMap;
}

function calculateCorrelation(stock1Data, stock2Data) {
  let startDate = new Date(Math.max(stock1Data[0].date, stock2Data[0].date));
  let correlation = 0;
  let quantity = 0;

  for (let i = 1, j = 1; i < stock1Data.length && j < stock2Data.length; ) {
    if (stock1Data[i].date < startDate) {
      i++;
      continue;
    }
    if (stock2Data[j].date < startDate) {
      j++;
      continue;
    }

    const change1 = stock1Data[i].isIncrease;
    const change2 = stock2Data[j].isIncrease;

    if (change1 === 0 || change2 === 0) {
      // 如果其中一個是平盤，correlation 保持不變
    } else if (change1 === change2) {
      correlation++;
    } else {
      correlation--;
    }
    quantity++;
    i++;
    j++;
  }

  return { startDate, quantity, correlation };
}
function formatDateForMySQL(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
async function calculateAllCorrelations(stockMap) {
  let processedCount = 1;

  const results = [];
  const symbols = Array.from(stockMap.keys());

  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const stock1 = symbols[i];
      const stock2 = symbols[j];
      const { startDate, quantity, correlation } = calculateCorrelation(
        stockMap.get(stock1),
        stockMap.get(stock2)
      );
      const formattedStartDate = formatDateForMySQL(startDate);
      results.push({
        stock1,
        stock2,
        start_date: formattedStartDate,
        quantity,
        correlation,
      });
    }
    if (results.length >= 1000) {
      await Correlation.bulkCreate(results, { logging: false });
      results.length = 0; // 清空結果數組
      processedCount += 1;
      console.log("存入", processedCount, ",000筆");
    }
  }
  if (results.length > 0) {
    await Correlation.bulkCreate(results, { logging: false });
  }

  return results;
}

async function readStockData() {
  const filePath = path.join(__dirname, "stock-data.json");
  const rawData = await fs.readFile(filePath, "utf8");
  return JSON.parse(rawData);
}
// router.get("/correlations", async (req, res) => {
//   try {
//     const stockData = await readStockData();
//     const stockMap = processStockData(stockData);
//     const correlations = await calculateAllCorrelations(stockMap);
//     res.send(`Calculated and saved ${correlations.length} correlations.`);
//   } catch (error) {
//     console.error(error);
//     res.status(500).send("An error occurred while processing the request.");
//   }
// });

router.get("/correlationsData/:sign/:page", async (req, res) => {
  const sign = req.params.sign;
  const page = parseInt(req.params.page) || 1;
  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  try {
    const { count, rows: correlations } = await Correlation.findAndCountAll({
      where: {
        correlation: sign === "0" ? { [Op.gt]: 0 } : { [Op.lt]: 0 },
      },
      order: [["correlation", sign === "0" ? "DESC" : "ASC"]],
      limit: pageSize,
      offset: offset,
    });

    if (correlations.length > 0) {
      const totalPages = Math.ceil(count / pageSize);
      res.json({
        correlations: correlations,
        currentPage: page,
        totalPages: totalPages,
        totalItems: count,
      });
    } else {
      res.status(404);
    }
  } catch (error) {
    console.error(error);
    res.status(500);
  }
});

module.exports = router;
