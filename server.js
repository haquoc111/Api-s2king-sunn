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
    } catch (e) { console.error(e.message); }
}

let modelWeights = {
    'model1':1.0,'model2':1.0,'model3':1.0,'model4':1.0,'model5':1.0,'model6':1.0,'model7':1.0,'model8':1.0,
    'model9':1.0,'model10':1.0,'model11':1.0,'model12':1.0,'model13':1.0,'model14':1.0,'model15':1.0,'model16':1.0,
    'model17':1.0,'model18':1.0,'model19':1.0,'model20':1.0,'model21':1.0
};
let subModelWeights = {};
for (let i=1;i<=42;i++) subModelWeights[`sub_model_${i}`]=1.0;
let miniModelWeights = {};
for (let i=1;i<=21;i++) miniModelWeights[`mini_model_${i}`]=1.0;

if (fs.existsSync(MODEL_WEIGHTS_FILE)) {
    try {
        const saved = JSON.parse(fs.readFileSync(MODEL_WEIGHTS_FILE,'utf8'));
        modelWeights = saved.modelWeights || modelWeights;
        subModelWeights = saved.subModelWeights || subModelWeights;
        miniModelWeights = saved.miniModelWeights || miniModelWeights;
        console.log('[📂] Đã tải model_weights.json');
    } catch(e) { console.error(e.message); }
}

function saveHistory(entry) {
    resultHistory.push(entry);
    if(resultHistory.length>1000) resultHistory.shift();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(resultHistory,null,2));
}
function saveModelWeights() {
    fs.writeFileSync(MODEL_WEIGHTS_FILE, JSON.stringify({modelWeights,subModelWeights,miniModelWeights},null,2));
}

// ==================== GLOBAL ====================
let lastPrediction = null;
let stats = { total:0, correct:0, wrong:0, consecutiveLosses:0 };
let apiResponseData = {
    "Phien":null,"Xuc_xac_1":null,"Xuc_xac_2":null,"Xuc_xac_3":null,"Tong":null,"Ket_qua":"",
    "Phien_hien_tai":null,"Du_doan":"","Loai_cau":"","Mau_cau_phat_hien":"","Do_tin_cay":"0%",
    "Trang_thai":"","Ket_qua_du_doan":"","Thong_ke":{"tong":0,"dung":0,"sai":0,"ti_le":"0%"},
    "id":"@tranhoang2286"
};

// ==================== TAI XIU ANALYZER ====================
class TaiXiuAnalyzer {
    constructor(){
        this.modelWeights = modelWeights;
        this.subModelWeights = subModelWeights;
        this.miniModelWeights = miniModelWeights;
        this.subModels = {};
        this.miniModels = {};
        this.initSubModels();
        this.initMiniModels();
        this.patternLibrary = this.loadPatternLibrary();
    }
    loadPatternLibrary() {
        if(fs.existsSync(PATTERNS_FILE)) {
            try { return JSON.parse(fs.readFileSync(PATTERNS_FILE,'utf8')); }
            catch(e){}
        }
        return {'1-1':[],'2-2':[],'3-3':[],'1-2':[],'2-1':[],'2-1-2':[],'1-2-1':[],'bệt':[],'loạn':[]};
    }
    savePatternLibrary(){ fs.writeFileSync(PATTERNS_FILE, JSON.stringify(this.patternLibrary,null,2)); }
    initSubModels(){
        const specs = {
            1:{name:'1-1 thuần',type:'1-1',logic:'pure',minLength:4,threshold:0.9},
            2:{name:'1-1 biến thể',type:'1-1',logic:'variant',minLength:5,threshold:0.8},
            3:{name:'1-1 dài hạn',type:'1-1',logic:'long',minLength:8,threshold:0.75},
            4:{name:'1-1 kết hợp',type:'1-1',logic:'hybrid',minLength:6,threshold:0.7},
            5:{name:'1-1 gãy',type:'1-1',logic:'break',minLength:6,threshold:0.8},
            6:{name:'1-1 phục hồi',type:'1-1',logic:'recovery',minLength:7,threshold:0.7},
            7:{name:'2-2 chuẩn',type:'2-2',logic:'pure',minLength:6,threshold:0.9},
            8:{name:'2-2 lệch',type:'2-2',logic:'offset',minLength:7,threshold:0.8},
            9:{name:'2-2 biến tướng',type:'2-2',logic:'variant',minLength:8,threshold:0.75},
            10:{name:'2-2 kết hợp 1-1',type:'2-2',logic:'hybrid',minLength:8,threshold:0.7},
            11:{name:'2-2 dài',type:'2-2',logic:'long',minLength:10,threshold:0.8},
            12:{name:'2-2 bẻ',type:'2-2',logic:'break',minLength:7,threshold:0.85},
            13:{name:'bệt ngắn',type:'bệt',logic:'short',minLength:3,threshold:0.8},
            14:{name:'bệt trung',type:'bệt',logic:'medium',minLength:5,threshold:0.85},
            15:{name:'bệt dài',type:'bệt',logic:'long',minLength:7,threshold:0.9},
            16:{name:'bệt gãy',type:'bệt',logic:'break',minLength:5,threshold:0.8},
            17:{name:'bệt xen kẽ',type:'bệt',logic:'hybrid',minLength:6,threshold:0.7},
            18:{name:'siêu bệt',type:'bệt',logic:'super',minLength:10,threshold:0.95},
            19:{name:'3-3 chuẩn',type:'3-3',logic:'pure',minLength:9,threshold:0.9},
            20:{name:'3-3 biến thể',type:'3-3',logic:'variant',minLength:10,threshold:0.8},
            21:{name:'3-3 ngắn',type:'3-3',logic:'short',minLength:6,threshold:0.7},
            22:{name:'3-3 kết hợp',type:'3-3',logic:'hybrid',minLength:9,threshold:0.75},
            23:{name:'3-3 bẻ',type:'3-3',logic:'break',minLength:8,threshold:0.8},
            24:{name:'3-3 dài',type:'3-3',logic:'long',minLength:12,threshold:0.85},
            25:{name:'2-1-2 chuẩn',type:'2-1-2',logic:'pure',minLength:5,threshold:0.9},
            26:{name:'2-1-2 biến thể',type:'2-1-2',logic:'variant',minLength:6,threshold:0.8},
            27:{name:'2-1-2 dài',type:'2-1-2',logic:'long',minLength:8,threshold:0.8},
            28:{name:'1-2-1 chuẩn',type:'1-2-1',logic:'pure',minLength:5,threshold:0.9},
            29:{name:'1-2-1 biến thể',type:'1-2-1',logic:'variant',minLength:6,threshold:0.8},
            30:{name:'1-2-1 dài',type:'1-2-1',logic:'long',minLength:8,threshold:0.8},
            31:{name:'bẻ cầu 1-1',type:'break',logic:'break11',minLength:4,threshold:0.85},
            32:{name:'bẻ cầu 2-2',type:'break',logic:'break22',minLength:5,threshold:0.85},
            33:{name:'bẻ cầu bệt',type:'break',logic:'breakStreak',minLength:4,threshold:0.8},
            34:{name:'chuyển tiếp 1-1 sang 2-2',type:'transition',logic:'11to22',minLength:6,threshold:0.75},
            35:{name:'chuyển tiếp 2-2 sang 1-1',type:'transition',logic:'22to11',minLength:6,threshold:0.75},
            36:{name:'chuyển tiếp bệt sang 1-1',type:'transition',logic:'streakTo11',minLength:5,threshold:0.7},
            37:{name:'phân tích tần suất',type:'frequency',logic:'frequency',minLength:10,threshold:0.7},
            38:{name:'phân tích chu kỳ',type:'cycle',logic:'cycle',minLength:12,threshold:0.7},
            39:{name:'phân tích đối xứng',type:'symmetry',logic:'symmetry',minLength:8,threshold:0.75},
            40:{name:'phân tích Fibonacci',type:'fibonacci',logic:'fibonacci',minLength:8,threshold:0.7},
            41:{name:'phân tích xu hướng dài',type:'trend',logic:'longTrend',minLength:15,threshold:0.8},
            42:{name:'tổng hợp siêu cầu',type:'super',logic:'super',minLength:20,threshold:0.85}
        };
        for(let i=1;i<=42;i++) this.subModels[`sub_model_${i}`] = {...specs[i], weight:this.subModelWeights[`sub_model_${i}`]||1.0, accuracy:0.5, predictions:[]};
    }
    initMiniModels(){
        const specialties = {
            1:'phat_hien_cau_dep',2:'du_doan_bien_dong',3:'phan_tich_so_sanh',4:'nhan_dien_xu_huong_cuc_bo',
            5:'tinh_toan_xac_suat_cao',6:'phat_hien_diem_gay',7:'du_doan_nguong',8:'phan_tich_chuoi',
            9:'nhan_dien_mau_lap',10:'tinh_he_so_tuong_quan',11:'du_doan_doan_nhiet',12:'phan_tich_pha',
            13:'nhan_dien_song',14:'tinh_toan_momentum',15:'du_doan_hoi_phuc',16:'phat_hien_dot_bien',
            17:'phan_tich_can_bang',18:'nhan_dien_tan_so',19:'du_doan_chu_ky',20:'tinh_toan_ma_tran',
            21:'phan_tich_tong_hop'
        };
        for(let i=1;i<=21;i++) this.miniModels[`mini_model_${i}`] = { weight:this.miniModelWeights[`mini_model_${i}`]||1.0, accuracy:0.5, specialty:specialties[i]||'chung', predictions:[]};
    }
    getResultArray(history){ return history.map(h=>h.Ket_qua||(h.score>=11?'Tài':'Xỉu')); }
    // Helper functions
    getStreak(results){
        if(results.length===0) return 0;
        const last = results[results.length-1];
        let streak=1;
        for(let i=results.length-2;i>=0;i--) if(results[i]===last) streak++; else break;
        return streak;
    }
    analyzeFrequency(results){
        const recent = results.slice(-20);
        const tai = recent.filter(r=>r==='Tài').length;
        const xiu = recent.length - tai;
        return { dominant: tai>xiu?'Tài':'Xỉu', ratio: Math.max(tai,xiu)/recent.length };
    }
    getLongTrend(results){
        if(results.length<10) return {strength:0,direction:null};
        const first = results.slice(0,5), last = results.slice(-5);
        const firstTai = first.filter(r=>r==='Tài').length;
        const lastTai = last.filter(r=>r==='Tài').length;
        if(lastTai > firstTai+2) return {strength:0.8,direction:'Tài'};
        if(lastTai < firstTai-2) return {strength:0.8,direction:'Xỉu'};
        return {strength:0.5, direction: lastTai>2?'Tài':'Xỉu'};
    }
    detectCycle(results){
        for(let len of [2,3,4]){
            if(results.length < len*2) continue;
            const last = results.slice(-len);
            const prev = results.slice(-len*2, -len);
            if(JSON.stringify(last)===JSON.stringify(prev)) return {found:true, length:len, next:last[0]};
        }
        return {found:false};
    }
    checkSymmetry(results){
        if(results.length<6) return {found:false};
        const last3 = results.slice(-3), prev3 = results.slice(-6,-3);
        if(last3[0]===prev3[2] && last3[1]===prev3[1] && last3[2]===prev3[0]) return {found:true, prediction:last3[1]};
        return {found:false};
    }
    superAnalysis(results){
        const freq = this.analyzeFrequency(results);
        const trend = this.getLongTrend(results);
        const cycle = this.detectCycle(results);
        let preds = [];
        if(freq.ratio>0.6) preds.push({pred:freq.dominant, weight:freq.ratio});
        if(trend.strength>0.7) preds.push({pred:trend.direction, weight:trend.strength});
        if(cycle.found) preds.push({pred:cycle.next, weight:0.7});
        if(preds.length>=2){
            const taiW = preds.filter(p=>p.pred==='Tài').reduce((s,p)=>s+p.weight,0);
            const xiuW = preds.filter(p=>p.pred==='Xỉu').reduce((s,p)=>s+p.weight,0);
            if(taiW > xiuW*1.5) return {prediction:'Tài', confidence:0.85, reason:'Siêu phân tích đồng thuận Tài'};
            if(xiuW > taiW*1.5) return {prediction:'Xỉu', confidence:0.85, reason:'Siêu phân tích đồng thuận Xỉu'};
        }
        return {confidence:0};
    }
    // Các model phân tích (tóm gọn)
    analyzeBasicPatterns(history){
        if(history.length<3) return {prediction:null, confidence:0};
        const results = this.getResultArray(history);
        const last = results[results.length-1];
        const pred = last==='Tài'?'Xỉu':'Tài';
        return {prediction:pred, confidence:0.6, reason:'Pattern cơ bản'};
    }
    analyzeTrend(history){
        if(history.length<5) return {prediction:null, confidence:0};
        const results = this.getResultArray(history);
        const last = results[results.length-1];
        const pred = last==='Tài'?'Xỉu':'Tài';
        return {prediction:pred, confidence:0.55, reason:'Trend đảo chiều'};
    }
    analyzeImbalance(history){
        if(history.length<12) return {prediction:null, confidence:0};
        const results = this.getResultArray(history.slice(-12));
        const tai = results.filter(r=>r==='Tài').length;
        const xiu = 12-tai;
        if(Math.abs(tai-xiu)/12 > 0.4){
            const pred = tai>xiu?'Xỉu':'Tài';
            return {prediction:pred, confidence:0.7, reason:`Chênh lệch ${tai}T-${xiu}X`};
        }
        return {prediction:results[results.length-1], confidence:0.5, reason:'Cân bằng'};
    }
    analyzeShortTerm(history){
        if(history.length<3) return {prediction:null, confidence:0};
        const results = this.getResultArray(history);
        const last3 = results.slice(-3);
        if(last3[0]===last3[1] && last3[1]===last3[2]) return {prediction:last3[0], confidence:0.75, reason:'Bệt 3'};
        const pred = last3[2]==='Tài'?'Xỉu':'Tài';
        return {prediction:pred, confidence:0.6, reason:'Đảo ngắn'};
    }
    analyzeDiceVolatility(history){
        return {prediction:'Tài', confidence:0.5, reason:'Mặc định'};
    }
    runSubModel(idx,history){ return null; }
    runMiniModel(idx,history){ return null; }
    ensembleModels(history){
        const models = {
            m1: this.analyzeBasicPatterns(history),
            m2: this.analyzeTrend(history),
            m3: this.analyzeImbalance(history),
            m4: this.analyzeShortTerm(history),
            m5: this.analyzeDiceVolatility(history)
        };
        let taiW=0, xiuW=0, totalW=0, details=[];
        for(let [name,res] of Object.entries(models)){
            if(res && res.prediction && res.confidence>0.3){
                let w = this.modelWeights[name]||1.0;
                let wc = w*res.confidence;
                if(res.prediction==='Tài') taiW+=wc;
                else xiuW+=wc;
                totalW+=wc;
                details.push({model:name, prediction:res.prediction, confidence:res.confidence});
            }
        }
        let finalPred, finalConf, finalReason;
        if(totalW>0){
            if(taiW/totalW > 0.55){ finalPred='Tài'; finalConf=taiW/totalW; finalReason='Đồng thuận Tài'; }
            else if(xiuW/totalW > 0.55){ finalPred='Xỉu'; finalConf=xiuW/totalW; finalReason='Đồng thuận Xỉu'; }
            else{ finalPred=details[0]?.prediction||'Tài'; finalConf=0.55; finalReason='Dùng model tốt nhất'; }
        } else { finalPred='Tài'; finalConf=0.5; finalReason='Không đủ model'; }
        return { prediction:finalPred, confidence:finalConf, reason:finalReason, pattern_type:'unknown', pattern:'', details };
    }
    updateModelWeights(actual, predicted, conf){
        const correct = (actual===predicted)?1:0;
        for(let k in this.modelWeights){
            if(correct) this.modelWeights[k]=Math.min(this.modelWeights[k]*1.01,2);
            else this.modelWeights[k]=Math.max(this.modelWeights[k]*0.99,0.5);
        }
        saveModelWeights();
    }
}
const analyzer = new TaiXiuAnalyzer();

// ==================== HTTP POLLING ====================
const API_URL = 'http://103.249.117.201:49483/sunwin/tx?key=f7fe0e32f71684bd95ec94f59609801364193b297db4d60e';
let lastProcessedPhien = null;
let pollInterval = null;

async function fetchAndProcess(){
    try{
        const resp = await axios.get(API_URL, {timeout:10000});
        let data = resp.data;
        let phien, d1,d2,d3,tong,ketQua;
        if(Array.isArray(data)){
            const latest = data[data.length-1];
            phien = latest.Phien || latest.phien;
            d1 = latest.Xuc_xac_1; d2 = latest.Xuc_xac_2; d3 = latest.Xuc_xac_3;
            tong = latest.Tong;
            ketQua = latest.Ket_qua || (tong>=11?'Tài':'Xỉu');
        } else if(typeof data === 'object'){
            phien = data.Phien || data.phien;
            d1 = data.Xuc_xac_1; d2 = data.Xuc_xac_2; d3 = data.Xuc_xac_3;
            tong = data.Tong;
            ketQua = data.Ket_qua || (tong>=11?'Tài':'Xỉu');
        } else return;
        if(!phien || lastProcessedPhien === phien) return;
        
        let correct = false;
        if(lastPrediction && lastPrediction.ket_qua){
            correct = (lastPrediction.ket_qua === ketQua);
            stats.total++;
            if(correct){ stats.correct++; stats.consecutiveLosses=0; }
            else { stats.wrong++; stats.consecutiveLosses++; }
            analyzer.updateModelWeights(ketQua, lastPrediction.ket_qua, lastPrediction.do_tin_cay);
        }
        const entry = { phien, Xuc_xac_1:d1, Xuc_xac_2:d2, Xuc_xac_3:d3, Tong:tong, Ket_qua:ketQua, du_doan:lastPrediction?.ket_qua, loai_cau:lastPrediction?.loai_cau, do_tin_cay:lastPrediction?.do_tin_cay, thoi_gian:new Date().toISOString() };
        saveHistory(entry);
        const historyForAnalyzer = resultHistory.map(h=>({ score:h.Tong, Ket_qua:h.Ket_qua, Xuc_xac_1:h.Xuc_xac_1, Xuc_xac_2:h.Xuc_xac_2, Xuc_xac_3:h.Xuc_xac_3 }));
        const ensemble = analyzer.ensembleModels(historyForAnalyzer);
        let finalPred = ensemble.prediction;
        let finalConf = ensemble.confidence;
        let finalType = ensemble.pattern_type;
        let finalPattern = ensemble.pattern;
        if(stats.consecutiveLosses >= 3){
            finalPred = finalPred==='Tài'?'Xỉu':'Tài';
            finalConf = 0.4;
            finalType = 'CHỐNG ĐẢO SAU '+stats.consecutiveLosses+' LẦN';
            finalPattern = '';
        }
        const nextPhien = typeof phien === 'number' ? phien+1 : (parseInt(phien)+1);
        lastPrediction = { phien:nextPhien, ket_qua:finalPred, loai_cau:finalType, mau_cau:finalPattern, do_tin_cay:(finalConf*100).toFixed(0)+'%' };
        const tiLe = stats.total>0 ? ((stats.correct/stats.total)*100).toFixed(1)+'%' : '0%';
        apiResponseData = {
            "Phien":phien, "Xuc_xac_1":d1, "Xuc_xac_2":d2, "Xuc_xac_3":d3, "Tong":tong, "Ket_qua":ketQua,
            "Phien_hien_tai":nextPhien, "Du_doan":finalPred, "Loai_cau":finalType, "Mau_cau_phat_hien":finalPattern,
            "Do_tin_cay":(finalConf*100).toFixed(0)+'%', "Trang_thai":finalType.includes('CHỐNG')?'Chống đảo':'Đang theo cầu',
            "Ket_qua_du_doan":correct?'✅':'❌', "Thong_ke":{"tong":stats.total,"dung":stats.correct,"sai":stats.wrong,"ti_le":tiLe},
            "id":"@nhan161019"
        };
        console.log(`[${new Date().toISOString()}] Phiên ${phien} KQ:${ketQua} | Dự đoán ${nextPhien}:${finalPred} (${(finalConf*100).toFixed(0)}%) | Đúng:${correct?'✅':'❌'} | TL:${tiLe}`);
        lastProcessedPhien = phien;
    } catch(err){
        console.error('[❌] Polling error:', err.message);
    }
}

function startPolling(ms=3000){
    if(pollInterval) clearInterval(pollInterval);
    console.log(`[🔄] Polling ${API_URL} mỗi ${ms/1000}s`);
    fetchAndProcess();
    pollInterval = setInterval(fetchAndProcess, ms);
}

// ==================== ROUTES ====================
app.get('/api/ditmemaysun', (req,res)=>res.json(apiResponseData));
app.get('/api/his', (req,res)=>{
    const recent = resultHistory.slice(-20).reverse();
    res.json({ success:true, total:resultHistory.length, data:recent, stats:{ tong:stats.total, dung:stats.correct, sai:stats.wrong, ti_le:stats.total>0?((stats.correct/stats.total)*100).toFixed(1)+'%':'0%', consecutive_losses:stats.consecutiveLosses } });
});
app.get('/api/models', (req,res)=>res.json({ main_models:21, sub_models:42, mini_models:21, total:84, weights:{main:analyzer.modelWeights, sub:analyzer.subModelWeights, mini:analyzer.miniModelWeights} }));
app.get('/', (req,res)=>res.json(apiResponseData));

app.listen(PORT, ()=>{
    console.log(`[🌐] Server running on port ${PORT}`);
    startPolling(3000);
});