const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3001;

const HISTORY_FILE = './history.json';
let resultHistory = [];
if (fs.existsSync(HISTORY_FILE)) {
    try {
        resultHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        console.log(`Loaded ${resultHistory.length} sessions`);
    } catch(e) { console.error(e); }
}

// SunwinUltimateAI simplified (just enough to work)
class SunwinUltimateAI {
    constructor() {
        this.history = [];
        this.predictions = [];
        this.accuracy = { correct: 0, total: 0 };
    }

    addSession(sessionData) {
        const result = sessionData.ket_qua || sessionData.result;
        if (!result) return;
        const total = sessionData.tong || sessionData.total || 
                      ((sessionData.xuc_xac_1||0)+(sessionData.xuc_xac_2||0)+(sessionData.xuc_xac_3||0));
        const dice = [sessionData.xuc_xac_1||0, sessionData.xuc_xac_2||0, sessionData.xuc_xac_3||0];
        this.history.push({ result, total, dice, timestamp: Date.now() });
        if (this.history.length > 1000) this.history.shift();
        console.log(`[AI] Added session, total history: ${this.history.length}`);
    }

    predict() {
        if (this.history.length < 3) {
            return { prediction: 'Chưa đủ dữ liệu', confidence: 0, wait: true };
        }
        // Simple prediction: follow last result or simple pattern
        const last = this.history[this.history.length - 1].result;
        let prediction = (last === 'Tài') ? 'Xỉu' : 'Tài';
        let confidence = 60;
        // check streak
        let streak = 1;
        for (let i = this.history.length-2; i>=0; i--) {
            if (this.history[i].result === last) streak++;
            else break;
        }
        if (streak >= 3) {
            prediction = last;
            confidence = 70 + Math.min(20, streak*2);
        }
        const predObj = { prediction, confidence, timestamp: Date.now() };
        this.predictions.push(predObj);
        if (this.predictions.length > 100) this.predictions.shift();
        return predObj;
    }

    feedback(actual) {
        if (this.predictions.length === 0) return;
        const lastPred = this.predictions[this.predictions.length - 1];
        if (lastPred.prediction === actual) this.accuracy.correct++;
        this.accuracy.total++;
        console.log(`[AI] Feedback: predicted ${lastPred.prediction}, actual ${actual} -> ${lastPred.prediction === actual ? 'correct' : 'wrong'}`);
    }

    getStats() {
        return {
            accuracy: this.accuracy.total > 0 ? ((this.accuracy.correct / this.accuracy.total)*100).toFixed(2) : '0.00',
            totalPredictions: this.accuracy.total,
            totalCorrect: this.accuracy.correct,
            historySize: this.history.length
        };
    }
}

const ai = new SunwinUltimateAI();

// Polling
const API_URL = 'http://103.249.117.201:49483/sunwin/tx?key=f7fe0e32f71684bd95ec94f59609801364193b297db4d60e';
let lastPhien = null;

async function poll() {
    try {
        const res = await axios.get(API_URL, { timeout: 10000 });
        let data = res.data;
        let items = Array.isArray(data) ? data : [data];
        for (let item of items) {
            const phien = item.Phien || item.phien;
            if (!phien || phien === lastPhien) continue;
            lastPhien = phien;
            const d1 = item.Xuc_xac_1, d2 = item.Xuc_xac_2, d3 = item.Xuc_xac_3;
            const tong = item.Tong;
            const ketQua = item.Ket_qua || (tong >= 11 ? 'Tài' : 'Xỉu');
            console.log(`[Poll] New session ${phien}: ${d1}-${d2}-${d3} = ${tong} => ${ketQua}`);
            
            // Save history
            resultHistory.push({ phien, d1, d2, d3, tong, ketQua, time: new Date() });
            if (resultHistory.length > 1000) resultHistory.shift();
            fs.writeFileSync(HISTORY_FILE, JSON.stringify(resultHistory, null, 2));
            
            // Add to AI
            ai.addSession({ ket_qua: ketQua, total: tong, xuc_xac_1: d1, xuc_xac_2: d2, xuc_xac_3: d3 });
            
            // If we have at least 1 previous prediction, feedback
            if (ai.predictions.length > 0) {
                // The previous prediction corresponds to the session before this one
                // Actually we need to store prediction before seeing result, so we will predict after adding session?
                // Better: after adding session, we predict for NEXT session. But for feedback, we need to know if previous prediction was correct.
                // Let's store last prediction separately.
                if (ai.lastPrediction) {
                    const correct = (ai.lastPrediction === ketQua);
                    if (correct) ai.accuracy.correct++;
                    ai.accuracy.total++;
                    console.log(`[AI] Previous prediction was ${ai.lastPrediction}, actual ${ketQua} -> ${correct ? 'correct' : 'wrong'}`);
                }
            }
            // Make prediction for next session
            const pred = ai.predict();
            ai.lastPrediction = pred.prediction;
            console.log(`[AI] Prediction for next session: ${pred.prediction} (confidence ${pred.confidence}%)`);
        }
    } catch(err) {
        console.error('Poll error:', err.message);
    }
}

setInterval(poll, 3000);
poll(); // run immediately

// Express routes
app.get('/', (req, res) => {
    const lastPred = ai.predictions.length ? ai.predictions[ai.predictions.length-1] : null;
    const stats = ai.getStats();
    res.json({
        status: 'running',
        algorithm: 'SunwinUltimateAI (simplified)',
        last_prediction: lastPred ? lastPred.prediction : 'Chưa có',
        confidence: lastPred ? lastPred.confidence : 0,
        accuracy: stats.accuracy,
        history_size: ai.history.length
    });
});

app.get('/api/ditmemaysun', (req, res) => {
    const lastPred = ai.predictions.length ? ai.predictions[ai.predictions.length-1] : null;
    res.json({ prediction: lastPred?.prediction, confidence: lastPred?.confidence, stats: ai.getStats() });
});

app.get('/api/his', (req, res) => {
    res.json({ success: true, total: resultHistory.length, data: resultHistory.slice(-20).reverse() });
});

app.listen(PORT, () => {
    console.log(`Server on port ${PORT}`);
});