// Supabase 客戶端將由 supabase-config.js 提供
// 全局 Supabase 客戶端
let supabaseClient = null;

// 員工簽到系統 JavaScript
class AttendanceSystem {
    constructor() {
        this.form = document.getElementById('attendanceForm');
        this.currentTimeElement = document.getElementById('currentTime');
        this.countdownElement = document.getElementById('countdownDisplay');
        this.submitBtn = document.getElementById('submitBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.successModal = document.getElementById('successModal');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.closeModal = document.getElementById('closeModal');
        
        this.attendanceData = JSON.parse(localStorage.getItem('attendanceData')) || [];
        
        // 初始化Google Sheets整合（如果可用）
        this.googleSheets = null;
        this.googleSheetsEnabled = false;
        
        // 檢查GoogleSheetsIntegration是否可用
        if (typeof GoogleSheetsIntegration !== 'undefined') {
            this.googleSheets = new GoogleSheetsIntegration();
        } else {
            console.log('GoogleSheetsIntegration 不可用，跳過初始化');
        }
        
        this.init();
    }

    init() {
        this.updateCurrentTime();
        this.updateCountdown();
        this.setupEventListeners();
        this.setDefaultValues();
        this.updateStatistics(); // 這是異步的，會在後台載入
        this.setupFormValidation();
        this.initializeGoogleSheets();
        
        // 每秒更新時間和倒數計時
        setInterval(() => {
            this.updateCurrentTime();
            this.updateCountdown();
        }, 1000);
        
        // 每30秒自動更新統計（從Supabase）
        setInterval(() => {
            this.updateStatistics();
        }, 30000);
    }

    // 更新當前時間
    updateCurrentTime() {
        const now = new Date();
        const timeString = now.toLocaleString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        this.currentTimeElement.textContent = timeString;
    }

    // 更新倒數計時
    updateCountdown() {
        if (!this.countdownElement) return;
        
        try {
            // 目標日期：114年12月1日 (民國114年 = 西元2025年)
            const targetDate = new Date(2025, 11, 1); // 月份從0開始，所以11代表12月
            const now = new Date();
            
            // 計算時間差
            const timeDiff = targetDate.getTime() - now.getTime();
            
            if (timeDiff <= 0) {
                // 如果已經過了目標日期
                this.countdownElement.textContent = '已到期';
                this.countdownElement.style.color = '#e74c3c';
                return;
            }
            
            // 計算天數、小時、分鐘、秒數
            const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
            
            // 格式化顯示
            let displayText = '';
            if (days > 0) {
                displayText = `${days}天`;
                if (hours > 0) {
                    displayText += ` ${hours}時`;
                }
            } else if (hours > 0) {
                displayText = `${hours}時 ${minutes}分`;
            } else if (minutes > 0) {
                displayText = `${minutes}分 ${seconds}秒`;
            } else {
                displayText = `${seconds}秒`;
            }
            
            this.countdownElement.textContent = displayText;
            
            // 根據剩餘時間調整顏色
            if (days <= 7) {
                this.countdownElement.style.color = '#e74c3c'; // 紅色：最後一週
            } else if (days <= 30) {
                this.countdownElement.style.color = '#f39c12'; // 橙色：最後一個月
            } else {
                this.countdownElement.style.color = '#ffffff'; // 白色：正常
            }
            
        } catch (error) {
            console.error('倒數計時更新失敗:', error);
            this.countdownElement.textContent = '計算錯誤';
        }
    }

    // 設置事件監聽器
    setupEventListeners() {
        // 表單提交
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        
        // 重置按鈕
        this.resetBtn.addEventListener('click', () => this.resetForm());
        
        // Google Sheets配置按鈕（如果存在）
        const configBtn = document.getElementById('configGoogleSheets');
        if (configBtn) {
            configBtn.addEventListener('click', () => {
                this.configureGoogleSheets();
            });
        }
        
        // 關閉模態框
        this.closeModal.addEventListener('click', () => this.closeSuccessModal());
        
        // 點擊模態框外部關閉
        this.successModal.addEventListener('click', (e) => {
            if (e.target === this.successModal) {
                this.closeSuccessModal();
            }
        });
        
        // 地點選擇變化
        document.getElementById('location').addEventListener('change', (e) => {
            this.handleLocationChange(e.target.value);
        });
        
        // 使用現在時間按鈕
        document.getElementById('useCurrentTimeBtn').addEventListener('click', () => {
            this.setCurrentTime();
        });
        
        // 實時驗證
        this.setupRealTimeValidation();
    }

    // 設置默認值
    setDefaultValues() {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().slice(0, 5);
        
        document.getElementById('attendanceDate').value = today;
        document.getElementById('attendanceTime').value = currentTime;
        
        // 設置時間欄位智能更新
        this.setupTimeAutoUpdate();
    }

    // 設置時間自動更新
    setupTimeAutoUpdate() {
        const timeInput = document.getElementById('attendanceTime');
        let isUserEditing = false;
        let lastUserValue = '';
        
        // 監聽用戶輸入
        timeInput.addEventListener('input', () => {
            isUserEditing = true;
            lastUserValue = timeInput.value;
        });
        
        // 監聽焦點事件
        timeInput.addEventListener('focus', () => {
            isUserEditing = true;
        });
        
        // 監聽失焦事件
        timeInput.addEventListener('blur', () => {
            // 延遲一點時間再允許自動更新，給用戶時間完成編輯
            setTimeout(() => {
                isUserEditing = false;
            }, 2000);
        });
        
        // 監聽點擊事件（用戶可能想要手動編輯）
        timeInput.addEventListener('click', () => {
            isUserEditing = true;
        });
        
        // 每秒更新時間欄位（僅在用戶未編輯時）
        setInterval(() => {
            if (!isUserEditing && !timeInput.matches(':focus')) {
                const currentTime = new Date().toTimeString().slice(0, 5);
                timeInput.value = currentTime;
            }
        }, 1000);
    }

    // 設置表單驗證
    setupFormValidation() {
        const requiredFields = [
            'employeeName', 'department', 
            'attendanceDate', 'attendanceTime', 'location'
        ];

        requiredFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            const errorElement = document.getElementById(fieldId + 'Error');
            
            if (field && errorElement) {
                field.addEventListener('blur', () => {
                    this.validateField(field, errorElement);
                });
            }
        });
    }

    // 實時驗證
    setupRealTimeValidation() {
        // 姓名驗證
        const employeeNameField = document.getElementById('employeeName');
        if (employeeNameField) {
            employeeNameField.addEventListener('input', (e) => {
                const value = e.target.value;
                const errorElement = document.getElementById('employeeNameError');
                
                if (value && value.length < 2) {
                    this.showError(errorElement, '姓名至少需要2個字符');
                } else {
                    this.hideError(errorElement);
                }
            });
        }
    }

    // 驗證單個欄位
    validateField(field, errorElement) {
        // 檢查欄位是否存在
        if (!field) {
            console.warn('驗證欄位不存在');
            return false;
        }
        
        const value = field.value.trim();
        
        if (!value) {
            this.showError(errorElement, '此欄位為必填');
            return false;
        }
        
        // 特定欄位驗證
        switch (field.id) {
            case 'employeeName':
                if (value.length < 2) {
                    this.showError(errorElement, '姓名至少需要2個字符');
                    return false;
                }
                break;
            case 'attendanceDate':
                const selectedDate = new Date(value);
                const today = new Date();
                if (selectedDate > today) {
                    this.showError(errorElement, '不能選擇未來的日期');
                    return false;
                }
                break;
        }
        
        this.hideError(errorElement);
        return true;
    }

    // 顯示錯誤訊息
    showError(errorElement, message) {
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.classList.add('show');
        }
    }

    // 隱藏錯誤訊息
    hideError(errorElement) {
        if (errorElement) {
            errorElement.classList.remove('show');
        }
    }

    // 處理地點選擇變化
    handleLocationChange(location) {
        const customLocationGroup = document.getElementById('customLocationGroup');
        const customLocationInput = document.getElementById('customLocation');
        
        if (location === 'other') {
            customLocationGroup.style.display = 'block';
            customLocationInput.required = true;
        } else {
            customLocationGroup.style.display = 'none';
            customLocationInput.required = false;
            customLocationInput.value = '';
        }
    }

    // 處理表單提交
    async handleSubmit(e) {
        e.preventDefault();
        console.log('表單提交開始');
        
        const isValid = this.validateForm();
        console.log('表單驗證結果:', isValid);
        
        if (!isValid) {
            console.log('表單驗證失敗，停止提交');
            this.showNotification('請檢查表單中的錯誤', 'error');
            return;
        }
        
        console.log('表單驗證通過，開始提交');
        this.showLoading(true);
        
        try {
            const formData = await this.collectFormData();
            console.log('收集到的表單數據:', formData);
            
            const result = await this.submitAttendance(formData);
            console.log('數據提交成功:', result);
            
            this.showSuccessModal(formData, result);
            this.resetForm();
            this.updateStatistics();
        } catch (error) {
            console.error('提交失敗:', error);
            this.showNotification('提交失敗，請稍後再試', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // 驗證整個表單
    validateForm() {
        const requiredFields = [
            'employeeName', 'department', 
            'attendanceDate', 'attendanceTime', 'location'
        ];
        
        let isValid = true;
        
        console.log('開始驗證表單，必填欄位:', requiredFields);
        
        // 驗證必填欄位
        requiredFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            const errorElement = document.getElementById(fieldId + 'Error');
            
            console.log(`驗證欄位 ${fieldId}:`, field ? field.value : '欄位不存在');
            
            if (!this.validateField(field, errorElement)) {
                console.log(`欄位 ${fieldId} 驗證失敗`);
                isValid = false;
            } else {
                console.log(`欄位 ${fieldId} 驗證通過`);
            }
        });
        
        // 驗證簽到類型
        const attendanceType = document.querySelector('input[name="attendanceType"]:checked');
        const attendanceTypeError = document.getElementById('attendanceTypeError');
        
        console.log('驗證簽到類型:', attendanceType ? attendanceType.value : '未選擇');
        
        if (!attendanceType) {
            console.log('簽到類型驗證失敗：未選擇');
            this.showError(attendanceTypeError, '請選擇簽到類型');
            isValid = false;
        } else {
            console.log('簽到類型驗證通過');
            this.hideError(attendanceTypeError);
        }
        
        // 驗證自定義地點
        const location = document.getElementById('location').value;
        if (location === 'other') {
            const customLocation = document.getElementById('customLocation');
            const customLocationError = document.getElementById('customLocationError');
            
            if (!customLocation.value.trim()) {
                this.showError(customLocationError, '請說明其他地點');
                isValid = false;
            } else {
                this.hideError(customLocationError);
            }
        }
        
        return isValid;
    }

    // 收集表單數據
    async collectFormData() {
        const formData = new FormData(this.form);
        const data = {};
        
        for (let [key, value] of formData.entries()) {
            data[key] = value;
        }
        
        // 添加提交時間戳和ID
        data.submittedAt = new Date().toISOString();
        data.id = this.generateId();
        
        // 獲取IP資訊
        try {
            const ipInfo = await this.getIPInfo();
            data.ipInfo = ipInfo;
            console.log('獲取到的IP資訊:', ipInfo);
        } catch (error) {
            console.warn('獲取IP資訊失敗:', error);
            data.ipInfo = {
                ip: 'unknown',
                country: 'unknown',
                city: 'unknown',
                isp: 'unknown',
                timestamp: new Date().toISOString()
            };
        }
        
        // 確保所有必要字段都存在
        if (!data.employeeName) data.employeeName = '';
        if (!data.department) data.department = '';
        if (!data.attendanceDate) data.attendanceDate = '';
        if (!data.attendanceTime) data.attendanceTime = '';
        if (!data.attendanceType) data.attendanceType = '';
        if (!data.location) data.location = '';
        if (!data.customLocation) data.customLocation = '';
        if (!data.notes) data.notes = '';
        
        console.log('收集到的表單數據:', data);
        return data;
    }

    // 生成唯一ID
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // 獲取IP資訊
    async getIPInfo() {
        try {
            // 方法1: 嘗試從服務器端獲取IP（適用於Linux主機）
            const serverIP = await this.getServerSideIP();
            if (serverIP && serverIP.ip && serverIP.ip !== 'unknown') {
                console.log('從服務器端獲取IP成功:', serverIP);
                return serverIP;
            }
        } catch (error) {
            console.warn('服務器端IP獲取失敗:', error);
        }
        
        try {
            // 方法2: 使用 ipapi.co (免費，無需API key)
            console.log('嘗試從ipapi.co獲取IP信息...');
            const response = await fetch('https://ipapi.co/json/', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                timeout: 5000
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('ipapi.co返回數據:', data);
            
            return {
                ip: data.ip || 'unknown',
                country: data.country_name || 'unknown',
                city: data.city || 'unknown',
                region: data.region || 'unknown',
                isp: data.org || 'unknown',
                timezone: data.timezone || 'unknown',
                timestamp: new Date().toISOString(),
                source: 'ipapi.co'
            };
        } catch (error) {
            console.warn('ipapi.co 獲取失敗，嘗試備用方法:', error);
            
            try {
                // 方法3: 使用 ip-api.com (免費，無需API key)
                const response = await fetch('http://ip-api.com/json/', {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                    },
                    timeout: 3000
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const data = await response.json();
                
                return {
                    ip: data.query || 'unknown',
                    country: data.country || 'unknown',
                    city: data.city || 'unknown',
                    region: data.regionName || 'unknown',
                    isp: data.isp || 'unknown',
                    timezone: data.timezone || 'unknown',
                    timestamp: new Date().toISOString(),
                    source: 'ip-api.com'
                };
            } catch (error2) {
                console.warn('ip-api.com 也失敗，嘗試更多備用方法:', error2);
                
                try {
                    // 方法4: 使用 httpbin.org
                    const response = await fetch('https://httpbin.org/ip', {
                        method: 'GET',
                        timeout: 3000
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        return {
                            ip: data.origin || 'unknown',
                            country: 'unknown',
                            city: 'unknown',
                            region: 'unknown',
                            isp: 'unknown',
                            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
                            timestamp: new Date().toISOString(),
                            source: 'httpbin.org'
                        };
                    }
                } catch (error3) {
                    console.warn('httpbin.org 也失敗:', error3);
                }
                
                // 方法5: 使用本地資訊和環境推測
                return this.getLocalIPInfo();
            }
        }
    }

    // 從服務器端獲取IP（適用於Linux主機部署）
    async getServerSideIP() {
        try {
            // 嘗試從當前頁面的URL推測服務器IP
            const hostname = window.location.hostname;
            const protocol = window.location.protocol;
            
            // 如果是IP地址格式
            if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
                return {
                    ip: hostname,
                    country: 'Taiwan',
                    city: 'Server',
                    region: 'Server',
                    isp: 'Server',
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Taipei',
                    timestamp: new Date().toISOString(),
                    source: 'server_hostname'
                };
            }
            
            // 如果是中正大學域名，返回學校信息
            if (hostname.includes('ccu.edu.tw')) {
                return {
                    ip: hostname,
                    country: 'Taiwan',
                    city: 'Chiayi',
                    region: 'Chiayi County',
                    isp: 'National Chung Cheng University',
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Taipei',
                    timestamp: new Date().toISOString(),
                    source: 'domain_detection'
                };
            }
            
            // 嘗試從服務器端API獲取（現在有API端點了）
            console.log('嘗試從服務器API獲取IP信息...');
            const response = await fetch(`${protocol}//${hostname}/api/ip`, {
                method: 'GET',
                timeout: 3000
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('服務器API返回數據:', data);
                return {
                    ip: data.ip || hostname,
                    country: data.country || 'Taiwan',
                    city: data.city || 'Server',
                    region: data.region || 'Server',
                    isp: data.isp || 'Server',
                    timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Taipei',
                    timestamp: new Date().toISOString(),
                    source: 'server_api'
                };
            } else {
                console.log(`服務器API返回錯誤: ${response.status}`);
            }
        } catch (error) {
            console.warn('服務器端IP獲取失敗:', error);
        }
        
        return null;
    }

    // 獲取本地IP資訊（最後的備用方案）
    getLocalIPInfo() {
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        
        // 根據hostname推測環境
        let environment = 'unknown';
        let location = 'unknown';
        
        if (hostname.includes('cs.ccu.edu.tw')) {
            environment = 'CCU Server';
            location = '中正大學';
        } else if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
            environment = 'Local Development';
            location = '本地開發';
        } else if (hostname.includes('github.io')) {
            environment = 'GitHub Pages';
            location = 'GitHub';
        } else if (hostname.includes('vercel.app')) {
            environment = 'Vercel';
            location = 'Vercel';
        } else if (hostname.includes('netlify.app')) {
            environment = 'Netlify';
            location = 'Netlify';
        }
        
        return {
            ip: hostname,
            country: 'Taiwan',
            city: location,
            region: environment,
            isp: environment,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Taipei',
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            protocol: protocol,
            hostname: hostname,
            timestamp: new Date().toISOString(),
            source: 'local_environment'
        };
    }

    // 提交簽到數據
    async submitAttendance(data) {
        try {
            console.log('提交的數據:', data);
            console.log('當前環境:', {
                protocol: window.location.protocol,
                hostname: window.location.hostname,
                userAgent: navigator.userAgent
            });
            
            // 首先嘗試提交到Supabase
            try {
                console.log('準備提交到Supabase（使用寫死的配置）...');
                
                // 確保 AttendanceManager 已初始化
                if (!window.attendanceManager) {
                    console.warn('AttendanceManager未初始化，嘗試初始化...');
                    await window.attendanceManager.initialize();
                }
                
                console.log('準備向 Supabase 插入數據...');
                const supabaseResult = await window.attendanceManager.submitAttendance(data);

                console.log('Supabase插入結果:', supabaseResult);

                if (!supabaseResult.success) {
                    throw new Error(supabaseResult.message || 'Supabase插入失敗');
                }

                console.log('簽到記錄提交成功，記錄ID:', supabaseResult.data.id);
                
                // 同時保存到本地存儲作為備份
                this.saveToLocalStorage(data);
                
                return { 
                    success: true, 
                    data, 
                    supabaseResponse: supabaseResult
                };
            } catch (supabaseError) {
                console.warn('提交到Supabase失敗，使用本地存儲:', supabaseError);
                console.error('Supabase錯誤詳情:', supabaseError);
                
                // 如果Supabase提交失敗，回退到本地存儲
                this.saveToLocalStorage(data);
                
                return { success: true, data, fallback: true, error: supabaseError.message };
            }
        } catch (error) {
            console.error('提交失敗:', error);
            throw error;
        }
    }
    
    // 保存到本地存儲
    saveToLocalStorage(data) {
        try {
            // 檢查localStorage可用性
            if (typeof(Storage) === "undefined") {
                throw new Error('瀏覽器不支持localStorage');
            }
            
            // 保存到本地存儲
            this.attendanceData.push(data);
            localStorage.setItem('attendanceData', JSON.stringify(this.attendanceData));
            
            console.log('數據已保存到本地存儲');
            
            // 保存JSON文件到本地存儲
            this.saveJSONToStorage(data);
            
            // 如果Google Sheets已啟用，也提交到Google Sheets
            if (this.googleSheetsEnabled && this.googleSheets) {
                try {
                    this.googleSheets.submitAttendanceData(data);
                    console.log('數據已成功提交到Google Sheets');
                } catch (error) {
                    console.warn('提交到Google Sheets失敗，但本地存儲成功:', error);
                }
            }
        } catch (error) {
            console.error('本地存儲失敗:', error);
            throw error;
        }
    }

    // 顯示成功模態框
    showSuccessModal(data, result = null) {
        const successMessage = document.getElementById('successMessage');
        const submissionDetails = document.getElementById('submissionDetails');
        
        const attendanceTypeText = data.attendanceType === 'checkin' ? '上學簽到' : '放學簽退';
        
        // 根據提交結果顯示不同訊息
        let message = `您的${attendanceTypeText}已成功提交！`;
        if (result && result.supabaseResponse) {
            message += ' 數據已保存到Supabase雲端資料庫。';
        } else if (result && result.fallback) {
            message += ' 數據已保存到本地存儲（Supabase暫時不可用）。';
        } else {
            message += ' 數據已保存到本地存儲。';
        }
        
        successMessage.textContent = message;
        
        // 顯示提交詳情
        const ipInfo = data.ipInfo || {};
        submissionDetails.innerHTML = `
            <div><strong>姓名:</strong> ${data.employeeName}</div>
            <div><strong>班級:</strong> ${this.getDepartmentName(data.department)}</div>
            <div><strong>簽到類型:</strong> ${attendanceTypeText}</div>
            <div><strong>日期:</strong> ${data.attendanceDate}</div>
            <div><strong>時間:</strong> ${data.attendanceTime}</div>
            <div><strong>地點:</strong> ${this.getLocationName(data.location)}${data.customLocation ? ` (${data.customLocation})` : ''}</div>
            <div><strong>提交時間:</strong> ${new Date(data.submittedAt).toLocaleString('zh-TW')}</div>
            <div><strong>IP地址:</strong> ${ipInfo.ip || 'unknown'}</div>
            <div><strong>位置:</strong> ${ipInfo.city || 'unknown'}, ${ipInfo.country || 'unknown'}</div>
            <div><strong>ISP:</strong> ${ipInfo.isp || 'unknown'}</div>
            ${result && result.supabaseResponse ? `<div><strong>記錄ID:</strong> ${result.supabaseResponse.data.id}</div>` : ''}
        `;
        
        this.successModal.classList.add('show');
    }

    // 關閉成功模態框
    closeSuccessModal() {
        this.successModal.classList.remove('show');
    }

    // 顯示載入動畫
    showLoading(show) {
        if (show) {
            this.loadingOverlay.classList.add('show');
            this.submitBtn.disabled = true;
        } else {
            this.loadingOverlay.classList.remove('show');
            this.submitBtn.disabled = false;
        }
    }

    // 重置表單
    resetForm() {
        this.form.reset();
        this.setDefaultValues();
        this.clearAllErrors();
        this.handleLocationChange('');
    }

    // 清除所有錯誤訊息
    clearAllErrors() {
        const errorElements = document.querySelectorAll('.error-message');
        errorElements.forEach(element => {
            element.classList.remove('show');
        });
    }

    // 更新統計資訊
    async updateStatistics() {
        try {
            // 先從本地存儲獲取快速統計
            const today = new Date().toISOString().split('T')[0];
            const todayData = this.attendanceData.filter(item => item.attendanceDate === today);
            
            const checkins = todayData.filter(item => item.attendanceType === 'checkin').length;
            const checkouts = todayData.filter(item => item.attendanceType === 'checkout').length;
            
            document.getElementById('todayCheckins').textContent = checkins;
            document.getElementById('todayCheckouts').textContent = checkouts;
            
            // 從 Supabase 獲取今日記錄
            await this.loadTodayRecordsFromSupabase();
            
        } catch (error) {
            console.error('更新統計失敗:', error);
        }
    }
    
    // 從 Supabase 載入今日記錄
    async loadTodayRecordsFromSupabase() {
        try {
            if (!window.attendanceManager) {
                console.warn('AttendanceManager 未初始化，跳過 Supabase 統計');
                // 使用本地數據更新列表
                const today = new Date().toISOString().split('T')[0];
                const todayData = this.attendanceData.filter(item => item.attendanceDate === today);
                this.updateTodayAttendanceList(todayData);
                return;
            }
            
            // 確保初始化
            await window.attendanceManager.initialize();
            
            // 從 Supabase 獲取今日記錄
            const today = new Date().toISOString().split('T')[0];
            const result = await window.attendanceManager.getAttendanceRecords(
                { date: today }, 
                100, 
                0
            );
            
            if (result.success) {
                console.log(`從 Supabase 獲取今日記錄: ${result.data.length} 筆`);
                
                // 轉換為本地格式
                const todayData = result.data.map(record => ({
                    id: record.id,
                    employeeName: record.employee_name,
                    department: record.department,
                    attendanceDate: record.attendance_date,
                    attendanceTime: record.attendance_time.substring(0, 5), // 轉換 HH:MM:SS 為 HH:MM
                    attendanceType: record.attendance_type,
                    location: record.location,
                    customLocation: record.custom_location
                }));
                
                // 更新統計數字
                const checkins = todayData.filter(item => item.attendanceType === 'checkin').length;
                const checkouts = todayData.filter(item => item.attendanceType === 'checkout').length;
                
                document.getElementById('todayCheckins').textContent = checkins;
                document.getElementById('todayCheckouts').textContent = checkouts;
                
                // 更新列表
                this.updateTodayAttendanceList(todayData);
            } else {
                console.warn('獲取 Supabase 記錄失敗，使用本地數據');
                const today = new Date().toISOString().split('T')[0];
                const todayData = this.attendanceData.filter(item => item.attendanceDate === today);
                this.updateTodayAttendanceList(todayData);
            }
        } catch (error) {
            console.error('載入 Supabase 今日記錄失敗:', error);
            // 使用本地數據作為備用
            const today = new Date().toISOString().split('T')[0];
            const todayData = this.attendanceData.filter(item => item.attendanceDate === today);
            this.updateTodayAttendanceList(todayData);
        }
    }

    // 更新今日簽到學生列表
    updateTodayAttendanceList(todayData) {
        const attendanceListContainer = document.getElementById('attendanceList');
        const todayAttendanceList = document.getElementById('todayAttendanceList');
        
        if (!attendanceListContainer || !todayAttendanceList) {
            console.warn('簽到列表容器不存在');
            return;
        }
        
        if (todayData.length === 0) {
            todayAttendanceList.style.display = 'none';
            return;
        }
        
        // 按時間排序（最新的在前）
        const sortedData = todayData.sort((a, b) => {
            const timeA = new Date(`${a.attendanceDate}T${a.attendanceTime}`);
            const timeB = new Date(`${b.attendanceDate}T${b.attendanceTime}`);
            return timeB - timeA;
        });
        
        // 生成簽到學生列表HTML
        const listHTML = sortedData.map(item => {
            const typeText = item.attendanceType === 'checkin' ? '簽到' : '簽退';
            const typeClass = item.attendanceType;
            
            return `
                <div class="attendance-item">
                    <div class="attendance-student">${item.employeeName}</div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="attendance-time">${item.attendanceTime}</span>
                        <span class="attendance-type ${typeClass}">${typeText}</span>
                    </div>
                </div>
            `;
        }).join('');
        
        attendanceListContainer.innerHTML = listHTML;
        todayAttendanceList.style.display = 'block';
        
        console.log(`更新今日簽到列表，共 ${todayData.length} 筆記錄`);
    }

    // 顯示通知
    showNotification(message, type = 'info') {
        // 創建通知元素
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // 添加樣式
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '15px 20px',
            borderRadius: '8px',
            color: 'white',
            fontWeight: '500',
            zIndex: '3000',
            transform: 'translateX(100%)',
            transition: 'transform 0.3s ease',
            backgroundColor: type === 'error' ? '#e74c3c' : '#27ae60'
        });
        
        document.body.appendChild(notification);
        
        // 顯示動畫
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // 自動隱藏
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    // 獲取班級名稱
    getDepartmentName(code) {
        const departments = {
            'IT': '選手'
        };
        return departments[code] || code;
    }

    // 獲取地點名稱
    getLocationName(code) {
        const locations = {
            'office': '選手教室',
            'other': '其他'
        };
        return locations[code] || code;
    }

    // 初始化Google Sheets
    async initializeGoogleSheets() {
        try {
            if (!this.googleSheets) {
                console.log('Google Sheets 不可用，跳過初始化');
                return;
            }
            
            await this.googleSheets.initialize();
            console.log('Google Sheets API 初始化成功');
            
            // 檢查是否有保存的配置
            const savedConfig = localStorage.getItem('googleSheetsConfig');
            if (savedConfig) {
                const config = JSON.parse(savedConfig);
                this.googleSheets.setConfig(config);
                this.googleSheetsEnabled = true;
                this.showGoogleSheetsStatus('已連接Google Sheets', 'success');
            }
        } catch (error) {
            console.warn('Google Sheets API 初始化失敗:', error);
            this.showGoogleSheetsStatus('Google Sheets 未配置', 'warning');
        }
    }

    // 配置Google Sheets
    async configureGoogleSheets() {
        try {
            if (!this.googleSheets) {
                this.showNotification('Google Sheets 功能不可用', 'error');
                return;
            }
            
            // 顯示配置對話框
            const config = await this.showConfigDialog();
            if (config) {
                this.googleSheets.setConfig(config);
                
                // 保存配置到本地存儲
                localStorage.setItem('googleSheetsConfig', JSON.stringify(config));
                
                // 如果沒有Spreadsheet ID，創建新的
                if (!config.spreadsheetId) {
                    const spreadsheetId = await this.googleSheets.createSpreadsheet('員工簽到記錄');
                    config.spreadsheetId = spreadsheetId;
                    localStorage.setItem('googleSheetsConfig', JSON.stringify(config));
                }
                
                this.googleSheetsEnabled = true;
                this.showGoogleSheetsStatus('Google Sheets 配置成功！', 'success');
                
                // 顯示Google Sheets URL
                const url = this.googleSheets.getSpreadsheetUrl();
                if (url) {
                    this.showNotification(`Google Sheets 已創建: ${url}`, 'info');
                }
            }
        } catch (error) {
            console.error('配置Google Sheets失敗:', error);
            this.showNotification('配置失敗: ' + error.message, 'error');
        }
    }

    // 顯示配置對話框
    showConfigDialog() {
        return new Promise((resolve) => {
            // 創建配置模態框
            const modal = document.createElement('div');
            modal.className = 'modal show';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header">
                        <h2><i class="fas fa-cog"></i> Google Sheets 配置</h2>
                    </div>
                    <div class="modal-body">
                        <p>請輸入您的Google API配置資訊：</p>
                        <div class="form-group">
                            <label for="clientId">Client ID *</label>
                            <input type="text" id="clientId" placeholder="您的Google API Client ID" required>
                        </div>
                        <div class="form-group">
                            <label for="apiKey">API Key *</label>
                            <input type="text" id="apiKey" placeholder="您的Google API Key" required>
                        </div>
                        <div class="form-group">
                            <label for="spreadsheetId">Spreadsheet ID (可選)</label>
                            <input type="text" id="spreadsheetId" placeholder="留空將自動創建新的Google Sheets">
                        </div>
                        <div class="info-card" style="margin-top: 15px;">
                            <h4><i class="fas fa-info-circle"></i> 如何獲取API配置：</h4>
                            <ol style="text-align: left; margin: 10px 0;">
                                <li>前往 <a href="https://console.developers.google.com/" target="_blank">Google Cloud Console</a></li>
                                <li>創建新專案或選擇現有專案</li>
                                <li>啟用 Google Sheets API</li>
                                <li>創建憑證 (OAuth 2.0 Client ID 和 API Key)</li>
                            </ol>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" id="cancelConfig" class="btn btn-secondary">取消</button>
                        <button type="button" id="saveConfig" class="btn btn-primary">保存配置</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // 事件監聽器
            document.getElementById('cancelConfig').onclick = () => {
                document.body.removeChild(modal);
                resolve(null);
            };
            
            document.getElementById('saveConfig').onclick = () => {
                const clientId = document.getElementById('clientId').value.trim();
                const apiKey = document.getElementById('apiKey').value.trim();
                const spreadsheetId = document.getElementById('spreadsheetId').value.trim();
                
                if (!clientId || !apiKey) {
                    alert('請填寫Client ID和API Key');
                    return;
                }
                
                document.body.removeChild(modal);
                resolve({ clientId, apiKey, spreadsheetId });
            };
            
            // 點擊外部關閉
            modal.onclick = (e) => {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                    resolve(null);
                }
            };
        });
    }

    // 顯示Google Sheets狀態
    showGoogleSheetsStatus(message, type) {
        // 在標題區域添加狀態指示器
        let statusElement = document.getElementById('googleSheetsStatus');
        if (!statusElement) {
            statusElement = document.createElement('div');
            statusElement.id = 'googleSheetsStatus';
            statusElement.style.cssText = `
                position: absolute;
                top: 10px;
                right: 10px;
                padding: 5px 10px;
                border-radius: 15px;
                font-size: 0.8rem;
                font-weight: 500;
                z-index: 100;
            `;
            document.querySelector('.header').style.position = 'relative';
            document.querySelector('.header').appendChild(statusElement);
        }
        
        statusElement.textContent = message;
        statusElement.className = `google-sheets-status ${type}`;
        
        // 設置樣式
        const colors = {
            success: { bg: '#27ae60', color: 'white' },
            warning: { bg: '#f39c12', color: 'white' },
            error: { bg: '#e74c3c', color: 'white' }
        };
        
        const style = colors[type] || colors.warning;
        statusElement.style.backgroundColor = style.bg;
        statusElement.style.color = style.color;
    }

    // 保存JSON到本地存儲
    saveJSONToStorage(data) {
        try {
            console.log('開始保存JSON到本地存儲，不會彈出下載視窗');
            
            // 檢查localStorage可用性
            if (typeof(Storage) === "undefined") {
                console.warn('localStorage不可用，跳過JSON備份');
                return;
            }
            
            const jsonData = {
                attendanceRecord: data,
                exportInfo: {
                    exportTime: new Date().toISOString(),
                    version: '1.0',
                    system: '員工簽到系統',
                    environment: {
                        protocol: window.location.protocol,
                        hostname: window.location.hostname,
                        userAgent: navigator.userAgent
                    }
                }
            };

            const jsonString = JSON.stringify(jsonData, null, 2);
            const fileName = `簽到記錄_${data.employeeName}_${data.attendanceDate}_${data.attendanceTime.replace(':', '')}.json`;
            
            // 保存到localStorage作為備份
            const jsonBackupKey = `json_backup_${data.id}`;
            localStorage.setItem(jsonBackupKey, jsonString);
            
            // 保存文件名列表
            let fileList = JSON.parse(localStorage.getItem('jsonFileList') || '[]');
            fileList.push({
                id: data.id,
                fileName: fileName,
                timestamp: new Date().toISOString(),
                employeeName: data.employeeName,
                attendanceDate: data.attendanceDate
            });
            localStorage.setItem('jsonFileList', JSON.stringify(fileList));
            
            console.log('JSON文件已保存到本地存儲，沒有彈出下載視窗');
        } catch (error) {
            console.error('保存JSON文件失敗:', error);
        }
    }

    // 下載JSON文件方法已移除，現在只保存到本地存儲

    // 設置當前時間
    setCurrentTime() {
        const now = new Date();
        const currentTime = now.toTimeString().slice(0, 5);
        document.getElementById('attendanceTime').value = currentTime;
        
        // 顯示提示
        this.showNotification('時間已更新為當前時間', 'success');
    }
}

// 工具函數
const Utils = {
    // 格式化日期
    formatDate(date) {
        return new Date(date).toLocaleDateString('zh-TW');
    },
    
    // 格式化時間
    formatTime(time) {
        return new Date(`2000-01-01T${time}`).toLocaleTimeString('zh-TW', {
            hour: '2-digit',
            minute: '2-digit'
        });
    },
    
    // 驗證郵箱
    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },
    
    // 驗證手機號
    validatePhone(phone) {
        const re = /^09\d{8}$/;
        return re.test(phone);
    },
    
    // 防抖函數
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    // 節流函數
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
};

// 鍵盤快捷鍵
document.addEventListener('keydown', (e) => {
    // Ctrl + Enter 提交表單
    if (e.ctrlKey && e.key === 'Enter') {
        const form = document.getElementById('attendanceForm');
        if (form) {
            form.dispatchEvent(new Event('submit'));
        }
    }
    
    // Escape 關閉模態框
    if (e.key === 'Escape') {
        const modal = document.getElementById('successModal');
        if (modal && modal.classList.contains('show')) {
            modal.classList.remove('show');
        }
    }
});

// 頁面載入完成後初始化
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('📋 頁面載入完成，開始初始化系統');
        console.log('📋 環境信息:', {
            protocol: window.location.protocol,
            hostname: window.location.hostname,
            pathname: window.location.pathname,
            userAgent: navigator.userAgent,
            localStorage: typeof(Storage) !== "undefined",
            supabaseLoaded: typeof supabase !== "undefined"
        });
        
        // 檢查 Supabase 是否已初始化
        console.log('📋 檢查 Supabase 客戶端狀態:', {
            supabaseClientExists: supabaseClient !== null,
            supabaseSDKExists: typeof supabase !== "undefined"
        });
        
        new AttendanceSystem();
        
        // 添加頁面載入動畫
        document.body.style.opacity = '0';
        setTimeout(() => {
            document.body.style.transition = 'opacity 0.5s ease';
            document.body.style.opacity = '1';
        }, 100);
        
        console.log('✅ 系統初始化完成');
    } catch (error) {
        console.error('❌ 系統初始化失敗:', error);
        alert('系統初始化失敗，請刷新頁面重試');
    }
});

// 導出類別供其他模組使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AttendanceSystem, Utils };
}
