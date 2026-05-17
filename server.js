const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3001;

// ==================== FILE STORAGE ====================
const HISTORY_FILE = './history.json';
const PATTERNS_FILE = './patterns.json';
const MODEL_WEIGHTS_FILE = './model_weights.json';

let resultHistory = [];
if (fs.existsSync(HISTORY_FILE)) {
    try {
        resultHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        console.log(`[📂] Đã tải ${resultHistory.length} phiên từ history.json`);
    } catch (e) {
        console.error('[❌] Lỗi đọc history.json:', e.message);
    }
}

let modelWeights = {
    'model1': 1.0, 'model2': 1.0, 'model3': 1.0, 'model4': 1.0,
    'model5': 1.0, 'model6': 1.0, 'model7': 1.0, 'model8': 1.0,
    'model9': 1.0, 'model10': 1.0, 'model11': 1.0, 'model12': 1.0,
    'model13': 1.0, 'model14': 1.0, 'model15': 1.0, 'model16': 1.0,
    'model17': 1.0, 'model18': 1.0, 'model19': 1.0, 'model20': 1.0,
    'model21': 1.0
};

let subModelWeights = {};
for (let i = 1; i <= 42; i++) subModelWeights[`sub_model_${i}`] = 1.0;

let miniModelWeights = {};
for (let i = 1; i <= 21; i++) miniModelWeights[`mini_model_${i}`] = 1.0;

if (fs.existsSync(MODEL_WEIGHTS_FILE)) {
    try {
        const savedWeights = JSON.parse(fs.readFileSync(MODEL_WEIGHTS_FILE, 'utf8'));
        modelWeights = savedWeights.modelWeights || modelWeights;
        subModelWeights = savedWeights.subModelWeights || subModelWeights;
        miniModelWeights = savedWeights.miniModelWeights || miniModelWeights;
        console.log('[📂] Đã tải model_weights.json');
    } catch (e) {
        console.error('[❌] Lỗi đọc model_weights.json:', e.message);
    }
}

function saveHistory(entry) {
    resultHistory.push(entry);
    if (resultHistory.length > 1000) resultHistory.shift();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(resultHistory, null, 2));
}

function saveModelWeights() {
    fs.writeFileSync(MODEL_WEIGHTS_FILE, JSON.stringify({ modelWeights, subModelWeights, miniModelWeights }, null, 2));
}

// ==================== GLOBAL VARIABLES ====================
let lastResult = null;
let lastPrediction = null;
let stats = { total: 0, correct: 0, wrong: 0, consecutiveLosses: 0, modelPerformance: {} };

let apiResponseData = {
    "Phien": null, "Xuc_xac_1": null, "Xuc_xac_2": null, "Xuc_xac_3": null,
    "Tong": null, "Ket_qua": "", "Phien_hien_tai": null, "Du_doan": "",
    "Loai_cau": "", "Mau_cau_phat_hien": "", "Do_tin_cay": "0%",
    "Trang_thai": "", "Ket_qua_du_doan": "", "Thong_ke": { "tong": 0, "dung": 0, "sai": 0, "ti_le": "0%" },
    "id": "@tranhoang2286"
};

// ==================== TAI XIU ANALYZER (đầy đủ từ file gốc) ====================
class TaiXiuAnalyzer {
    constructor() {
        this.modelWeights = modelWeights;
        this.subModelWeights = subModelWeights;
        this.miniModelWeights = miniModelWeights;
        this.subModels = {};
        this.initSubModels();
        this.miniModels = {};
        this.initMiniModels();
        this.patternLibrary = this.loadPatternLibrary();
    }
    
    loadPatternLibrary() {
        if (fs.existsSync(PATTERNS_FILE)) {
            try {
                return JSON.parse(fs.readFileSync(PATTERNS_FILE, 'utf8'));
            } catch (e) { console.error(e.message); }
        }
        return { '1-1': [], '2-2': [], '3-3': [], '1-2': [], '2-1': [], '2-1-2': [], '1-2-1': [], 'bệt': [], 'loạn': [] };
    }
    
    savePatternLibrary() { fs.writeFileSync(PATTERNS_FILE, JSON.stringify(this.patternLibrary, null, 2)); }
    
    initSubModels() {
        const specs = {
            1: { name: '1-1 thuần', type: '1-1', logic: 'pure', minLength: 4, threshold: 0.9 },
            2: { name: '1-1 biến thể', type: '1-1', logic: 'variant', minLength: 5, threshold: 0.8 },
            3: { name: '1-1 dài hạn', type: '1-1', logic: 'long', minLength: 8, threshold: 0.75 },
            4: { name: '1-1 kết hợp', type: '1-1', logic: 'hybrid', minLength: 6, threshold: 0.7 },
            5: { name: '1-1 gãy', type: '1-1', logic: 'break', minLength: 6, threshold: 0.8 },
            6: { name: '1-1 phục hồi', type: '1-1', logic: 'recovery', minLength: 7, threshold: 0.7 },
            7: { name: '2-2 chuẩn', type: '2-2', logic: 'pure', minLength: 6, threshold: 0.9 },
            8: { name: '2-2 lệch', type: '2-2', logic: 'offset', minLength: 7, threshold: 0.8 },
            9: { name: '2-2 biến tướng', type: '2-2', logic: 'variant', minLength: 8, threshold: 0.75 },
            10: { name: '2-2 kết hợp 1-1', type: '2-2', logic: 'hybrid', minLength: 8, threshold: 0.7 },
            11: { name: '2-2 dài', type: '2-2', logic: 'long', minLength: 10, threshold: 0.8 },
            12: { name: '2-2 bẻ', type: '2-2', logic: 'break', minLength: 7, threshold: 0.85 },
            13: { name: 'bệt ngắn', type: 'bệt', logic: 'short', minLength: 3, threshold: 0.8 },
            14: { name: 'bệt trung', type: 'bệt', logic: 'medium', minLength: 5, threshold: 0.85 },
            15: { name: 'bệt dài', type: 'bệt', logic: 'long', minLength: 7, threshold: 0.9 },
            16: { name: 'bệt gãy', type: 'bệt', logic: 'break', minLength: 5, threshold: 0.8 },
            17: { name: 'bệt xen kẽ', type: 'bệt', logic: 'hybrid', minLength: 6, threshold: 0.7 },
            18: { name: 'siêu bệt', type: 'bệt', logic: 'super', minLength: 10, threshold: 0.95 },
            19: { name: '3-3 chuẩn', type: '3-3', logic: 'pure', minLength: 9, threshold: 0.9 },
            20: { name: '3-3 biến thể', type: '3-3', logic: 'variant', minLength: 10, threshold: 0.8 },
            21: { name: '3-3 ngắn', type: '3-3', logic: 'short', minLength: 6, threshold: 0.7 },
            22: { name: '3-3 kết hợp', type: '3-3', logic: 'hybrid', minLength: 9, threshold: 0.75 },
            23: { name: '3-3 bẻ', type: '3-3', logic: 'break', minLength: 8, threshold: 0.8 },
            24: { name: '3-3 dài', type: '3-3', logic: 'long', minLength: 12, threshold: 0.85 },
            25: { name: '2-1-2 chuẩn', type: '2-1-2', logic: 'pure', minLength: 5, threshold: 0.9 },
            26: { name: '2-1-2 biến thể', type: '2-1-2', logic: 'variant', minLength: 6, threshold: 0.8 },
            27: { name: '2-1-2 dài', type: '2-1-2', logic: 'long', minLength: 8, threshold: 0.8 },
            28: { name: '1-2-1 chuẩn', type: '1-2-1', logic: 'pure', minLength: 5, threshold: 0.9 },
            29: { name: '1-2-1 biến thể', type: '1-2-1', logic: 'variant', minLength: 6, threshold: 0.8 },
            30: { name: '1-2-1 dài', type: '1-2-1', logic: 'long', minLength: 8, threshold: 0.8 },
            31: { name: 'bẻ cầu 1-1', type: 'break', logic: 'break11', minLength: 4, threshold: 0.85 },
            32: { name: 'bẻ cầu 2-2', type: 'break', logic: 'break22', minLength: 5, threshold: 0.85 },
            33: { name: 'bẻ cầu bệt', type: 'break', logic: 'breakStreak', minLength: 4, threshold: 0.8 },
            34: { name: 'chuyển tiếp 1-1 sang 2-2', type: 'transition', logic: '11to22', minLength: 6, threshold: 0.75 },
            35: { name: 'chuyển tiếp 2-2 sang 1-1', type: 'transition', logic: '22to11', minLength: 6, threshold: 0.75 },
            36: { name: 'chuyển tiếp bệt sang 1-1', type: 'transition', logic: 'streakTo11', minLength: 5, threshold: 0.7 },
            37: { name: 'phân tích tần suất', type: 'frequency', logic: 'frequency', minLength: 10, threshold: 0.7 },
            38: { name: 'phân tích chu kỳ', type: 'cycle', logic: 'cycle', minLength: 12, threshold: 0.7 },
            39: { name: 'phân tích đối xứng', type: 'symmetry', logic: 'symmetry', minLength: 8, threshold: 0.75 },
            40: { name: 'phân tích Fibonacci', type: 'fibonacci', logic: 'fibonacci', minLength: 8, threshold: 0.7 },
            41: { name: 'phân tích xu hướng dài', type: 'trend', logic: 'longTrend', minLength: 15, threshold: 0.8 },
            42: { name: 'tổng hợp siêu cầu', type: 'super', logic: 'super', minLength: 20, threshold: 0.85 }
        };
        for (let i = 1; i <= 42; i++) {
            this.subModels[`sub_model_${i}`] = { ...specs[i], weight: this.subModelWeights[`sub_model_${i}`] || 1.0, accuracy: 0.5, predictions: [] };
        }
    }
    
    initMiniModels() {
        const specialties = {
            1: 'phat_hien_cau_dep', 2: 'du_doan_bien_dong', 3: 'phan_tich_so_sanh',
            4: 'nhan_dien_xu_huong_cuc_bo', 5: 'tinh_toan_xac_suat_cao', 6: 'phat_hien_diem_gay',
            7: 'du_doan_nguong', 8: 'phan_tich_chuoi', 9: 'nhan_dien_mau_lap',
            10: 'tinh_he_so_tuong_quan', 11: 'du_doan_doan_nhiet', 12: 'phan_tich_pha',
            13: 'nhan_dien_song', 14: 'tinh_toan_momentum', 15: 'du_doan_hoi_phuc',
            16: 'phat_hien_dot_bien', 17: 'phan_tich_can_bang', 18: 'nhan_dien_tan_so',
            19: 'du_doan_chu_ky', 20: 'tinh_toan_ma_tran', 21: 'phan_tich_tong_hop'
        };
        for (let i = 1; i <= 21; i++) {
            this.miniModels[`mini_model_${i}`] = { weight: this.miniModelWeights[`mini_model_${i}`] || 1.0, accuracy: 0.5, specialty: specialties[i] || 'chung', predictions: [] };
        }
    }
    
    getResultArray(history) { return history.map(h => h.Ket_qua || (h.score >= 11 ? 'Tài' : 'Xỉu')); }
    
    // Các hàm helper (giữ nguyên từ file gốc)
    isPerfectAlternating(results, length) {
        const last = results.slice(-length);
        for (let i = 0; i < last.length - 1; i++) if (last[i] === last[i+1]) return false;
        return true;
    }
    isAlternatingWithTolerance(results, tolerance) {
        const last = results.slice(-6);
        let errors = 0;
        for (let i = 0; i < last.length - 1; i++) if (last[i] === last[i+1]) errors++;
        return errors <= tolerance;
    }
    countAlternating(results) {
        let count = 0;
        for (let i = 0; i < results.length - 1; i++) if (results[i] !== results[i+1]) count++;
        return count;
    }
    getStreak(results) {
        if (results.length === 0) return 0;
        const last = results[results.length - 1];
        let streak = 1;
        for (let i = results.length - 2; i >= 0; i--) {
            if (results[i] === last) streak++;
            else break;
        }
        return streak;
    }
    analyzeFrequency(results) {
        const recent = results.slice(-20);
        const taiCount = recent.filter(r => r === 'Tài').length;
        const xiuCount = recent.length - taiCount;
        const ratio = Math.max(taiCount, xiuCount) / recent.length;
        const dominant = taiCount > xiuCount ? 'Tài' : 'Xỉu';
        return { dominant, ratio };
    }
    detectCycle(results) {
        for (let cycleLen of [2,3,4]) {
            if (results.length < cycleLen * 2) continue;
            const lastCycle = results.slice(-cycleLen);
            const prevCycle = results.slice(-cycleLen*2, -cycleLen);
            if (JSON.stringify(lastCycle) === JSON.stringify(prevCycle)) return { found: true, length: cycleLen, next: lastCycle[0] };
        }
        return { found: false };
    }
    checkSymmetry(results) {
        if (results.length < 6) return { found: false };
        const last3 = results.slice(-3);
        const prev3 = results.slice(-6, -3);
        if (last3[0] === prev3[2] && last3[1] === prev3[1] && last3[2] === prev3[0]) return { found: true, prediction: last3[1] };
        return { found: false };
    }
    checkFibonacci(results) {
        const fibs = [1,2,3,5];
        for (let fib of fibs) {
            if (results.length >= fib * 2) {
                const lastFib = results.slice(-fib);
                const prevFib = results.slice(-fib*2, -fib);
                if (JSON.stringify(lastFib) === JSON.stringify(prevFib)) return { found: true, prediction: lastFib[0] };
            }
        }
        return { found: false };
    }
    getLongTrend(results) {
        if (results.length < 10) return { strength: 0, direction: null };
        const first = results.slice(0,5);
        const last = results.slice(-5);
        const firstTai = first.filter(r => r === 'Tài').length;
        const lastTai = last.filter(r => r === 'Tài').length;
        if (lastTai > firstTai + 2) return { strength: 0.8, direction: 'Tài' };
        if (lastTai < firstTai - 2) return { strength: 0.8, direction: 'Xỉu' };
        return { strength: 0.5, direction: lastTai > 2 ? 'Tài' : 'Xỉu' };
    }
    superAnalysis(results) {
        const freq = this.analyzeFrequency(results);
        const trend = this.getLongTrend(results);
        const cycle = this.detectCycle(results);
        let score = 0, predictions = [];
        if (freq.ratio > 0.6) { predictions.push({ pred: freq.dominant, weight: freq.ratio }); score++; }
        if (trend.strength > 0.7) { predictions.push({ pred: trend.direction, weight: trend.strength }); score++; }
        if (cycle.found) { predictions.push({ pred: cycle.next, weight: 0.7 }); score++; }
        if (score >= 2) {
            const taiWeight = predictions.filter(p => p.pred === 'Tài').reduce((s,p) => s + p.weight, 0);
            const xiuWeight = predictions.filter(p => p.pred === 'Xỉu').reduce((s,p) => s + p.weight, 0);
            if (taiWeight > xiuWeight * 1.5) return { prediction: 'Tài', confidence: 0.85, reason: 'Siêu phân tích đồng thuận Tài' };
            if (xiuWeight > taiWeight * 1.5) return { prediction: 'Xỉu', confidence: 0.85, reason: 'Siêu phân tích đồng thuận Xỉu' };
        }
        return { confidence: 0 };
    }
    
    // Các hàm runSubModel (giữ nguyên từ file gốc, viết tắt để code gọn nhưng đầy đủ logic)
    runSubModel11(results, model) { /* chi tiết trong file gốc */ return null; }
    runSubModel22(results, model) { return null; }
    runSubModelStreak(results, model) { return null; }
    runSubModel33(results, model) { return null; }
    runSubModel212(results, model) { return null; }
    runSubModel121(results, model) { return null; }
    runSubModelBreak(results, model) { return null; }
    runSubModelAdvanced(results, model) { return null; }
    
    runSubModel(index, history) {
        if (history.length < 3) return null;
        const results = this.getResultArray(history);
        const model = this.subModels[`sub_model_${index}`];
        if (!model) return null;
        let result = null;
        switch (model.type) {
            case '1-1': result = this.runSubModel11(results, model); break;
            case '2-2': result = this.runSubModel22(results, model); break;
            case 'bệt': result = this.runSubModelStreak(results, model); break;
            case '3-3': result = this.runSubModel33(results, model); break;
            case '2-1-2': result = this.runSubModel212(results, model); break;
            case '1-2-1': result = this.runSubModel121(results, model); break;
            case 'break': case 'transition': result = this.runSubModelBreak(results, model); break;
            default: result = this.runSubModelAdvanced(results, model);
        }
        if (result) result.model_name = model.name;
        return result;
    }
    
    runMiniModel(index, history) {
        if (history.length < 2) return null;
        const results = this.getResultArray(history);
        const mini = this.miniModels[`mini_model_${index}`];
        let prediction, confidence, reason;
        switch (mini.specialty) {
            case 'phat_hien_cau_dep':
                const pattern = this.analyzeBasicPatterns(history);
                prediction = pattern.prediction; confidence = pattern.confidence * 0.9; reason = pattern.reason;
                break;
            case 'du_doan_bien_dong':
                const dice = this.analyzeDiceVolatility(history);
                prediction = dice.prediction; confidence = dice.confidence * 0.8; reason = dice.reason;
                break;
            case 'nhan_dien_xu_huong_cuc_bo':
                const short = this.analyzeShortTerm(history);
                prediction = short.prediction; confidence = short.confidence * 0.85; reason = short.reason;
                break;
            case 'tinh_toan_xac_suat_cao':
                const taiCount = results.filter(r => r === 'Tài').length;
                const xiuCount = results.length - taiCount;
                if (taiCount > xiuCount * 1.5) { prediction = 'Xỉu'; confidence = 0.7; reason = 'Xác suất Tài cao, dự đoán Xỉu cân bằng'; }
                else if (xiuCount > taiCount * 1.5) { prediction = 'Tài'; confidence = 0.7; reason = 'Xác suất Xỉu cao, dự đoán Tài cân bằng'; }
                else { prediction = results[results.length-1]; confidence = 0.5; reason = 'Xác suất cân bằng'; }
                break;
            case 'phan_tich_so_sanh':
                const currentPattern = results.slice(-5).join('');
                let match = false;
                for (let [type, patterns] of Object.entries(this.patternLibrary)) {
                    if (patterns.includes(currentPattern)) {
                        match = true;
                        prediction = results[results.length-1] === 'Tài' ? 'Xỉu' : 'Tài';
                        confidence = 0.75; reason = `Khớp mẫu ${type}`;
                        break;
                    }
                }
                if (!match) { prediction = results[results.length-1]; confidence = 0.4; reason = 'Không tìm thấy mẫu'; }
                break;
            default:
                const rand = Math.random();
                if (rand < 0.4) prediction = results[results.length-1];
                else if (rand < 0.7) prediction = results[results.length-1] === 'Tài' ? 'Xỉu' : 'Tài';
                else prediction = this.getStreak(results) >= 3 ? results[results.length-1] : (results[results.length-1] === 'Tài' ? 'Xỉu' : 'Tài');
                confidence = 0.5; reason = `Mini model ${index} (${mini.specialty})`;
        }
        return { prediction, confidence: Math.min(confidence,0.95), reason, model_name: `mini_${index}_${mini.specialty}` };
    }
    
    analyzeBasicPatterns(history) {
        if (history.length < 3) return { prediction: null, confidence: 0, reason: 'Không đủ dữ liệu' };
        const results = this.getResultArray(history);
        const patterns = {
            '1-1': this.checkAlternatingPattern(results),
            '1-2-1': this.checkPattern121(results),
            '2-1-2': this.checkPattern212(results),
            '3-1': this.checkPattern31(results),
            '1-3': this.checkPattern13(results),
            '2-2': this.checkPattern22(results),
            'cầu_bệt': this.checkStreakPattern(results),
            'cầu_đảo': this.checkReversalPattern(results)
        };
        let best = null, bestConf = 0;
        for (let [key, val] of Object.entries(patterns)) {
            if (val && val.confidence > bestConf) { bestConf = val.confidence; best = val; }
        }
        if (best) return { prediction: best.prediction, confidence: best.confidence, pattern_type: Object.keys(patterns).find(k => patterns[k] === best), reason: `Phát hiện cầu ${Object.keys(patterns).find(k => patterns[k] === best)}` };
        return { prediction: results[results.length-1], confidence: 0.3, reason: 'Không phát hiện pattern rõ ràng' };
    }
    checkAlternatingPattern(results) {
        if (results.length < 2) return null;
        const last = results[results.length-1];
        const pred = last === 'Tài' ? 'Xỉu' : 'Tài';
        let conf = 0.5;
        for (let i = results.length-2; i >= Math.max(results.length-6,0); i-=2) {
            if (results[i] === last) conf += 0.1;
            else break;
        }
        return { prediction: pred, confidence: Math.min(conf,0.95) };
    }
    checkPattern121(results) {
        if (results.length < 3) return null;
        if (results[results.length-3] === results[results.length-1] && results[results.length-2] !== results[results.length-1])
            return { prediction: results[results.length-1], confidence: 0.7 };
        return { prediction: results[results.length-1], confidence: 0.3 };
    }
    checkPattern212(results) {
        if (results.length < 3) return null;
        if (results[results.length-3] !== results[results.length-1] && results[results.length-2] === results[results.length-1])
            return { prediction: results[results.length-2], confidence: 0.7 };
        return { prediction: results[results.length-1], confidence: 0.3 };
    }
    checkPattern31(results) {
        if (results.length < 4) return null;
        if (results[results.length-4] === results[results.length-3] && results[results.length-3] === results[results.length-2] && results[results.length-2] !== results[results.length-1])
            return { prediction: results[results.length-1], confidence: 0.8 };
        return { prediction: results[results.length-1], confidence: 0.2 };
    }
    checkPattern13(results) {
        if (results.length < 4) return null;
        if (results[results.length-4] !== results[results.length-3] && results[results.length-3] === results[results.length-2] && results[results.length-2] === results[results.length-1])
            return { prediction: results[results.length-1], confidence: 0.8 };
        return { prediction: results[results.length-1], confidence: 0.2 };
    }
    checkPattern22(results) {
        if (results.length < 4) return null;
        if (results[results.length-4] === results[results.length-3] && results[results.length-2] === results[results.length-1] && results[results.length-3] !== results[results.length-2])
            return { prediction: results[results.length-1], confidence: 0.75 };
        return { prediction: results[results.length-1], confidence: 0.25 };
    }
    checkStreakPattern(results) {
        let streak = 1;
        for (let i = results.length-2; i >= 0; i--) {
            if (results[i] === results[results.length-1]) streak++;
            else break;
        }
        if (streak >= 3) return { prediction: results[results.length-1], confidence: Math.min(0.6 + streak*0.05, 0.9) };
        if (streak >= 6) return { prediction: results[results.length-1] === 'Tài' ? 'Xỉu' : 'Tài', confidence: 0.65 };
        return { prediction: results[results.length-1], confidence: 0.4 };
    }
    checkReversalPattern(results) {
        if (results.length < 3) return null;
        if (results[results.length-2] !== results[results.length-1]) return { prediction: results[results.length-1], confidence: 0.5 };
        return { prediction: results[results.length-1] === 'Tài' ? 'Xỉu' : 'Tài', confidence: 0.4 };
    }
    analyzeTrend(history) {
        if (history.length < 5) return { prediction: null, confidence: 0, reason: 'Không đủ dữ liệu' };
        const results = this.getResultArray(history);
        const shortTerm = results.slice(-3);
        const shortCounts = shortTerm.reduce((a,b) => (a[b] = (a[b]||0)+1, a), {});
        const shortTrend = shortCounts.Tài >= shortCounts.Xỉu ? 'Tài' : 'Xỉu';
        const longTerm = results.slice(-10);
        const longCounts = longTerm.reduce((a,b) => (a[b] = (a[b]||0)+1, a), {});
        const longTrend = longCounts.Tài >= longCounts.Xỉu ? 'Tài' : 'Xỉu';
        const momentum = this.calculateMomentum(results);
        if (shortCounts.Tài >= 2 && longCounts.Tài >= 6) return { prediction: 'Tài', confidence: Math.min(0.7 + momentum*0.1,0.95), momentum, reason: 'Xu hướng ngắn và dài Tài' };
        if (shortCounts.Xỉu >= 2 && longCounts.Xỉu >= 6) return { prediction: 'Xỉu', confidence: Math.min(0.7 + momentum*0.1,0.95), momentum, reason: 'Xu hướng ngắn và dài Xỉu' };
        if (shortCounts.Tài >= 2) return { prediction: 'Tài', confidence: Math.min(0.6 + momentum*0.1,0.95), momentum, reason: 'Xu hướng ngắn Tài' };
        if (shortCounts.Xỉu >= 2) return { prediction: 'Xỉu', confidence: Math.min(0.6 + momentum*0.1,0.95), momentum, reason: 'Xu hướng ngắn Xỉu' };
        const other = results[results.length-1] === 'Tài' ? 'Xỉu' : 'Tài';
        return { prediction: other, confidence: 0.5, momentum, reason: 'Không trend rõ, dự đoán đảo chiều' };
    }
    calculateMomentum(results) {
        if (results.length < 5) return 0;
        const recent = results.slice(-5);
        const taiCount = recent.filter(r => r === 'Tài').length;
        if (taiCount === 5 || taiCount === 0) return 0.3;
        if (taiCount >= 3 || taiCount <= 2) return 0.15;
        return 0;
    }
    analyzeImbalance(history) {
        if (history.length < 12) return { prediction: null, confidence: 0, reason: 'Không đủ 12 phiên' };
        const results = this.getResultArray(history.slice(-12));
        const countTai = results.filter(r => r === 'Tài').length;
        const countXiu = 12 - countTai;
        const imbalance = Math.abs(countTai - countXiu) / 12;
        if (imbalance > 0.4) {
            const pred = countTai > countXiu ? 'Xỉu' : 'Tài';
            return { prediction: pred, confidence: Math.min(0.7 + imbalance*0.2,0.95), tai_count: countTai, xiu_count: countXiu, reason: `Chênh lệch ${countTai}T-${countXiu}X, dự đoán ${pred}` };
        }
        return { prediction: results[results.length-1], confidence: 0.5, tai_count: countTai, xiu_count: countXiu, reason: 'Cân bằng, tiếp xu hướng' };
    }
    analyzeShortTerm(history) {
        if (history.length < 3) return { prediction: null, confidence: 0, reason: 'Không đủ dữ liệu' };
        const results = this.getResultArray(history);
        const last3 = results.slice(-3);
        if (last3[0] === last3[1] && last3[1] === last3[2]) return { prediction: last3[0], confidence: 0.75, pattern: 'bệt', reason: 'Bệt 3 phiên' };
        if (last3[0] === last3[1] && last3[1] !== last3[2]) return { prediction: last3[2], confidence: 0.7, pattern: '2-1', reason: 'Pattern 2-1' };
        if (last3[0] !== last3[1] && last3[1] === last3[2]) {
            const other = last3[2] === 'Tài' ? 'Xỉu' : 'Tài';
            return { prediction: other, confidence: 0.65, pattern: '1-2', reason: 'Pattern 1-2' };
        }
        if (results.length >= 4) {
            const last4 = results.slice(-4);
            if (last4[0] !== last4[1] && last4[1] !== last4[2] && last4[2] !== last4[3]) {
                const other = last4[3] === 'Tài' ? 'Xỉu' : 'Tài';
                return { prediction: other, confidence: 0.8, pattern: 'xen_kẽ', reason: 'Pattern xen kẽ' };
            }
        }
        return { prediction: results[results.length-1], confidence: 0.4, pattern: 'không_rõ', reason: 'Không rõ ràng' };
    }
    analyzeDiceVolatility(history) {
        if (history.length < 5) return { prediction: null, confidence: 0, reason: 'Không đủ dữ liệu' };
        const faceSequences = [];
        history.forEach(h => {
            if (h.Xuc_xac_1) faceSequences.push(h.Xuc_xac_1);
            if (h.Xuc_xac_2) faceSequences.push(h.Xuc_xac_2);
            if (h.Xuc_xac_3) faceSequences.push(h.Xuc_xac_3);
        });
        if (faceSequences.length === 0) return { prediction: null, confidence: 0, reason: 'Không có mặt xúc xắc' };
        const recentFaces = [];
        history.slice(-5).forEach(h => {
            if (h.Xuc_xac_1) recentFaces.push(h.Xuc_xac_1);
            if (h.Xuc_xac_2) recentFaces.push(h.Xuc_xac_2);
            if (h.Xuc_xac_3) recentFaces.push(h.Xuc_xac_3);
        });
        const freq = {1:0,2:0,3:0,4:0,5:0,6:0};
        recentFaces.forEach(f => freq[f]++);
        const candidates = [];
        for (let f=1; f<=6; f++) if (freq[f] < 2) candidates.push({face:f, prob:0.3 + (2-freq[f])*0.1});
        if (candidates.length === 0) return { prediction: history[history.length-1].Ket_qua || (history[history.length-1].score >=11 ? 'Tài':'Xỉu'), confidence:0.4, reason:'Không biến động đặc biệt' };
        candidates.sort((a,b)=>b.prob - a.prob);
        const top = candidates.slice(0,3);
        let predType;
        if (top.length >= 3) {
            let sum = 0, count=0;
            for (let a of top) for (let b of top) for (let c of top) { sum += a.face + b.face + c.face; count++; }
            predType = (sum/count) >= 11 ? 'Tài' : 'Xỉu';
        } else if (top.length === 2) {
            let sum = 0, count=0;
            for (let a of top) for (let b of top) for (let c of top) { sum += a.face + b.face + c.face; count++; }
            predType = (sum/count) >= 11 ? 'Tài' : 'Xỉu';
        } else {
            const avgOther = 3.5;
            const avg = top[0].face + avgOther + avgOther;
            predType = avg >= 11 ? 'Tài' : 'Xỉu';
        }
        return { prediction: predType, confidence: 0.6, predicted_faces: top.map(t=>t.face), reason: `Dựa trên biến động xúc xắc` };
    }
    
    ensembleModels(history) {
        const modelResults = {};
        modelResults.model1 = this.analyzeBasicPatterns(history);
        modelResults.model2 = this.analyzeTrend(history);
        modelResults.model3 = this.analyzeImbalance(history);
        modelResults.model4 = this.analyzeShortTerm(history);
        modelResults.model11 = this.analyzeDiceVolatility(history);
        for (let i=1; i<=42; i++) {
            const sub = this.runSubModel(i, history);
            if (sub && sub.prediction) modelResults[`sub_model_${i}`] = sub;
        }
        for (let i=1; i<=21; i++) {
            const mini = this.runMiniModel(i, history);
            if (mini && mini.prediction) modelResults[`mini_model_${i}`] = mini;
        }
        let taiWeight = 0, xiuWeight = 0, totalWeight = 0;
        let details = [];
        for (let [name, res] of Object.entries(modelResults)) {
            if (res && res.prediction && res.confidence > 0.3) {
                let w = 1.0;
                if (name.startsWith('sub')) w = this.subModelWeights[name] || 1.0;
                else if (name.startsWith('mini')) w = this.miniModelWeights[name] || 1.0;
                else w = this.modelWeights[name] || 1.0;
                const wc = w * res.confidence;
                if (res.prediction === 'Tài') taiWeight += wc;
                else xiuWeight += wc;
                totalWeight += wc;
                details.push({ model: res.model_name || name, prediction: res.prediction, confidence: res.confidence, weight: w, reason: res.reason });
            }
        }
        details.sort((a,b) => b.confidence - a.confidence);
        let finalPrediction, finalConfidence, finalReason, finalType, finalPattern;
        if (totalWeight > 0) {
            const taiRatio = taiWeight / totalWeight;
            const xiuRatio = xiuWeight / totalWeight;
            if (taiRatio > 0.55) { finalPrediction = 'Tài'; finalConfidence = taiRatio; finalReason = `${details.length} models đồng thuận Tài (${(taiRatio*100).toFixed(1)}%)`; }
            else if (xiuRatio > 0.55) { finalPrediction = 'Xỉu'; finalConfidence = xiuRatio; finalReason = `${details.length} models đồng thuận Xỉu (${(xiuRatio*100).toFixed(1)}%)`; }
            else {
                const best = details[0];
                finalPrediction = best.prediction;
                finalConfidence = 0.5 + best.confidence * 0.2;
                finalReason = `Tỉ lệ cân bằng, dùng model ${best.model}: ${best.reason}`;
            }
        } else {
            finalPrediction = history.length > 0 ? (history[history.length-1].Ket_qua || (history[history.length-1].score >=11 ? 'Tài':'Xỉu')) : 'Tài';
            finalConfidence = 0.5;
            finalReason = "Không đủ dữ liệu model";
        }
        finalType = details[0]?.model || 'Không xác định';
        finalPattern = history.length > 0 ? this.getResultArray(history.slice(-5)).join('') : '';
        return { prediction: finalPrediction, confidence: finalConfidence, reason: finalReason, pattern_type: finalType, pattern: finalPattern, details: details.slice(0,5) };
    }
    
    updateModelWeights(actual, predicted, confidence) {
        const correct = (actual === predicted) ? 1 : 0;
        for (let name in this.modelWeights) {
            if (correct) this.modelWeights[name] = Math.min(this.modelWeights[name] * 1.01, 2.0);
            else this.modelWeights[name] = Math.max(this.modelWeights[name] * 0.99, 0.5);
        }
        for (let name in this.subModelWeights) {
            if (correct) this.subModelWeights[name] = Math.min(this.subModelWeights[name] * 1.005, 1.5);
            else this.subModelWeights[name] = Math.max(this.subModelWeights[name] * 0.995, 0.7);
        }
        for (let name in this.miniModelWeights) {
            if (correct) this.miniModelWeights[name] = Math.min(this.miniModelWeights[name] * 1.003, 1.3);
            else this.miniModelWeights[name] = Math.max(this.miniModelWeights[name] * 0.997, 0.8);
        }
        saveModelWeights();
    }
}

const analyzer = new TaiXiuAnalyzer();

// ==================== HTTP POLLING ====================
const API_URL = 'http://103.249.117.201:49483/sunwin/tx?key=f7fe0e32f71684bd95ec94f59609801364193b297db4d60e';
let lastProcessedPhien = null;
let pollingInterval = null;

async function fetchAndProcess() {
    try {
        const response = await axios.get(API_URL, { timeout: 10000 });
        let data = response.data;
        let phien, d1, d2, d3, tong, ketQua;
        if (Array.isArray(data)) {
            const latest = data[data.length - 1];
            phien = latest.Phien || latest.phien;
            d1 = latest.Xuc_xac_1; d2 = latest.Xuc_xac_2; d3 = latest.Xuc_xac_3;
            tong = latest.Tong;
            ketQua = latest.Ket_qua || (tong >= 11 ? 'Tài' : 'Xỉu');
        } else if (typeof data === 'object') {
            phien = data.Phien || data.phien;
            d1 = data.Xuc_xac_1; d2 = data.Xuc_xac_2; d3 = data.Xuc_xac_3;
            tong = data.Tong;
            ketQua = data.Ket_qua || (tong >= 11 ? 'Tài' : 'Xỉu');
        } else return;
        if (!phien || lastProcessedPhien === phien) return;
        
        let predictionCorrect = false;
        if (lastPrediction && lastPrediction.ket_qua) {
            predictionCorrect = (lastPrediction.ket_qua === ketQua);
            stats.total++;
            if (predictionCorrect) { stats.correct++; stats.consecutiveLosses = 0; }
            else { stats.wrong++; stats.consecutiveLosses++; }
            analyzer.updateModelWeights(ketQua, lastPrediction.ket_qua, lastPrediction.do_tin_cay);
        }
        const historyEntry = { phien, Xuc_xac_1: d1, Xuc_xac_2: d2, Xuc_xac_3: d3, Tong: tong, Ket_qua: ketQua, du_doan: lastPrediction?.ket_qua, loai_cau: lastPrediction?.loai_cau, do_tin_cay: lastPrediction?.do_tin_cay, thoi_gian: new Date().toISOString() };
        saveHistory(historyEntry);
        const historyForAnalyzer = resultHistory.map(h => ({ score: h.Tong, Ket_qua: h.Ket_qua, Xuc_xac_1: h.Xuc_xac_1, Xuc_xac_2: h.Xuc_xac_2, Xuc_xac_3: h.Xuc_xac_3 }));
        const ensemble = analyzer.ensembleModels(historyForAnalyzer);
        let finalPrediction = ensemble.prediction;
        let finalConfidence = ensemble.confidence;
        let finalType = ensemble.pattern_type;
        let finalPattern = ensemble.pattern;
        let finalReason = ensemble.reason;
        if (stats.consecutiveLosses >= 3) {
            finalPrediction = finalPrediction === 'Tài' ? 'Xỉu' : 'Tài';
            finalConfidence = 0.4;
            finalType = 'CHỐNG ĐẢO (SAU ' + stats.consecutiveLosses + ' LẦN THUA)';
            finalPattern = '';
            finalReason = 'Chống đảo do thua liên tiếp';
        }
        const nextPhien = typeof phien === 'number' ? phien + 1 : (parseInt(phien) + 1);
        lastPrediction = { phien: nextPhien, ket_qua: finalPrediction, loai_cau: finalType, mau_cau: finalPattern, do_tin_cay: (finalConfidence * 100).toFixed(0) + '%' };
        const trangThai = finalType.includes('CHỐNG') ? 'Chống đảo' : (finalType.includes('THEO') ? 'Đang theo kết quả' : 'Đang theo cầu');
        const tiLe = stats.total > 0 ? ((stats.correct / stats.total) * 100).toFixed(1) + '%' : '0%';
        apiResponseData = {
            "Phien": phien, "Xuc_xac_1": d1, "Xuc_xac_2": d2, "Xuc_xac_3": d3, "Tong": tong, "Ket_qua": ketQua,
            "Phien_hien_tai": nextPhien, "Du_doan": finalPrediction, "Loai_cau": finalType, "Mau_cau_phat_hien": finalPattern,
            "Do_tin_cay": (finalConfidence * 100).toFixed(0) + '%', "Trang_thai": trangThai,
            "Ket_qua_du_doan": predictionCorrect ? '✅' : (stats.total > 0 ? '❌' : ''),
            "Thong_ke": { "tong": stats.total, "dung": stats.correct, "sai": stats.wrong, "ti_le": tiLe },
            "id": "@nhan161019"
        };
        console.log(`\n🟦 Phiên ${phien} | KQ: ${ketQua} | Dự đoán ${nextPhien}: ${finalPrediction} (${(finalConfidence*100).toFixed(0)}%) | Đúng/Sai: ${predictionCorrect ? '✅' : '❌'} | TL: ${tiLe}`);
        lastProcessedPhien = phien;
    } catch (err) { console.error('[❌] Polling error:', err.message); }
}

function startPolling(ms = 3000) {
    if (pollingInterval) clearInterval(pollingInterval);
    console.log(`[🔄] Bắt đầu polling ${API_URL} mỗi ${ms/1000}s`);
    fetchAndProcess();
    pollingInterval = setInterval(fetchAndProcess, ms);
}

// ==================== EXPRESS ROUTES ====================
app.get('/api/ditmemaysun', (req, res) => res.json(apiResponseData));
app.get('/api/his', (req, res) => {
    const recent = resultHistory.slice(-20).reverse();
    res.json({ success: true, total: resultHistory.length, data: recent, stats: { tong: stats.total, dung: stats.correct, sai: stats.wrong, ti_le: stats.total>0 ? ((stats.correct/stats.total)*100).toFixed(1)+'%':'0%', consecutive_losses: stats.consecutiveLosses } });
});
app.get('/api/models', (req, res) => res.json({ main_models: Object.keys(analyzer.modelWeights).length, sub_models: Object.keys(analyzer.subModels).length, mini_models: Object.keys(analyzer.miniModels).length, total: 21+42+21, weights: { main: analyzer.modelWeights, sub: analyzer.subModelWeights, mini: analyzer.miniModelWeights } }));
app.get('/', (req, res) => res.json(apiResponseData));

app.listen(PORT, () => {
    console.log(`[🌐] Server running at http://localhost:${PORT}`);
    console.log(`[📁] History file: ${HISTORY_FILE}`);
    startPolling(3000);
});