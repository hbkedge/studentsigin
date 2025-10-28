// Supabase 配置（寫死）
const SUPABASE_CONFIG = {
    url: 'https://gtokauywjdcnqmlxugur.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0b2thdXl3amRjbnFtbHh1Z3VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNDg1OTEsImV4cCI6MjA3NjcyNDU5MX0.1zihmDGER5PDeX41XCorsLqeh4Dks26cZq00BdpgkC4'
};

// Supabase配置和連接
class SupabaseConfig {
    constructor() {
        this.supabaseUrl = SUPABASE_CONFIG.url;
        this.supabaseKey = SUPABASE_CONFIG.anonKey;
        this.supabase = null;
        this.isInitialized = false;
    }

    // 初始化Supabase
    async initialize(url = SUPABASE_CONFIG.url, key = SUPABASE_CONFIG.anonKey) {
        try {
            console.log('開始初始化Supabase（使用寫死的配置）');
            
            this.supabaseUrl = url;
            this.supabaseKey = key;
            
            // 動態載入Supabase客戶端
            if (typeof supabase === 'undefined') {
                console.log('Supabase客戶端未載入，正在載入...');
                await this.loadSupabaseClient();
            }
            
            if (typeof supabase === 'undefined') {
                throw new Error('Supabase客戶端載入失敗');
            }
            
            console.log('創建Supabase客戶端...');
            this.supabase = supabase.createClient(url, key);
            this.isInitialized = true;
            
            // 保存配置到localStorage
            localStorage.setItem('supabase_config', JSON.stringify({
                url: url,
                key: key,
                timestamp: new Date().toISOString()
            }));
            
            console.log('Supabase初始化成功');
            return true;
        } catch (error) {
            console.error('Supabase初始化失敗:', error);
            return false;
        }
    }

    // 動態載入Supabase客戶端
    async loadSupabaseClient() {
        return new Promise((resolve, reject) => {
            // 檢查是否已經載入
            if (typeof supabase !== 'undefined') {
                console.log('Supabase客戶端已存在');
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
            script.onload = () => {
                console.log('Supabase客戶端載入成功');
                resolve();
            };
            script.onerror = () => {
                console.error('Supabase客戶端載入失敗');
                reject(new Error('無法載入Supabase客戶端'));
            };
            document.head.appendChild(script);
        });
    }

    // 從localStorage載入配置
    loadFromStorage() {
        try {
            const config = localStorage.getItem('supabase_config');
            if (config) {
                const parsed = JSON.parse(config);
                this.supabaseUrl = parsed.url;
                this.supabaseKey = parsed.key;
                return true;
            }
        } catch (error) {
            console.error('載入Supabase配置失敗:', error);
        }
        return false;
    }

    // 檢查是否已初始化
    isReady() {
        return this.isInitialized && this.supabase !== null;
    }

    // 獲取Supabase客戶端
    getClient() {
        if (!this.isReady()) {
            throw new Error('Supabase未初始化');
        }
        return this.supabase;
    }
}

// 全局Supabase配置實例
window.supabaseConfig = new SupabaseConfig();

// 簽到數據管理類
class AttendanceManager {
    constructor() {
        this.supabase = null;
        this.initializePromise = null;
    }

    // 初始化
    async initialize() {
        // 如果已經在初始化中，等待完成
        if (this.initializePromise) {
            return this.initializePromise;
        }
        
        this.initializePromise = this._doInitialize();
        return this.initializePromise;
    }
    
    async _doInitialize() {
        try {
            console.log('AttendanceManager開始初始化（使用寫死的配置）...');
            
            // 直接使用寫死的配置初始化
            const success = await window.supabaseConfig.initialize();
            if (!success) {
                throw new Error('Supabase初始化失敗');
            }
            
            this.supabase = window.supabaseConfig.getClient();
            console.log('AttendanceManager初始化成功');
            return true;
        } catch (error) {
            console.error('AttendanceManager初始化失敗:', error);
            this.initializePromise = null; // 重置，允許重試
            throw error;
        }
    }

    // 提交簽到記錄
    async submitAttendance(data) {
        try {
            console.log('開始提交簽到記錄:', data);
            
            // 確保Supabase已初始化
            if (!this.supabase) {
                console.log('Supabase未初始化，正在初始化...');
                await this.initialize();
            }

            // 檢查Supabase客戶端是否可用
            if (!this.supabase) {
                throw new Error('Supabase客戶端初始化失敗');
            }

            // 準備數據
            const attendanceData = {
                employee_name: data.employeeName,
                department: data.department,
                attendance_date: data.attendanceDate, // 格式: 'YYYY-MM-DD'
                attendance_time: data.attendanceTime + ':00', // 格式: 'HH:MM:SS'（添加秒數）
                attendance_type: data.attendanceType,
                location: data.location,
                custom_location: data.customLocation || '',
                notes: data.notes || '',
                ip_address: data.ipInfo?.ip || 'unknown',
                ip_country: data.ipInfo?.country || 'unknown',
                ip_city: data.ipInfo?.city || 'unknown',
                ip_isp: data.ipInfo?.isp || 'unknown',
                user_agent: navigator.userAgent
                // 不要手動設置 submitted_at，讓資料庫自動設置
            };

            console.log('準備插入的數據:', attendanceData);

            // 插入數據到Supabase
            const { data: result, error } = await this.supabase
                .from('attendance_records')
                .insert([attendanceData])
                .select();

            console.log('Supabase插入結果:', { result, error });

            if (error) {
                console.error('Supabase插入錯誤詳情:', {
                    message: error.message,
                    details: error.details,
                    hint: error.hint,
                    code: error.code,
                    error: error
                });
                throw new Error(`Supabase插入錯誤: ${error.message} (代碼: ${error.code})`);
            }

            if (!result || result.length === 0) {
                throw new Error('插入成功但沒有返回數據');
            }

            console.log('簽到記錄提交成功，記錄ID:', result[0].id);

            return {
                success: true,
                data: result[0],
                message: '簽到記錄已成功保存到Supabase'
            };

        } catch (error) {
            console.error('提交簽到記錄失敗:', error);
            throw error;
        }
    }

    // 測試Supabase連接
    async testConnection() {
        try {
            if (!this.supabase) {
                await this.initialize();
            }
            
            if (!this.supabase) {
                throw new Error('Supabase客戶端未初始化');
            }
            
            // 嘗試查詢資料表
            const { data, error } = await this.supabase
                .from('attendance_records')
                .select('count', { count: 'exact', head: true });
            
            if (error) {
                throw new Error(`連接測試失敗: ${error.message}`);
            }
            
            return {
                success: true,
                message: 'Supabase連接測試成功',
                recordCount: data || 0
            };
        } catch (error) {
            console.error('Supabase連接測試失敗:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    // 獲取簽到記錄
    async getAttendanceRecords(filters = {}, limit = 100, offset = 0) {
        try {
            if (!this.supabase) {
                await this.initialize();
            }

            let query = this.supabase
                .from('attendance_records')
                .select('*', { count: 'exact' });

            // 應用篩選器
            if (filters.date) {
                query = query.eq('attendance_date', filters.date);
            }
            if (filters.type) {
                query = query.eq('attendance_type', filters.type);
            }
            if (filters.employee_name) {
                query = query.ilike('employee_name', `%${filters.employee_name}%`);
            }

            // 排序和分頁
            query = query
                .order('submitted_at', { ascending: false })
                .range(offset, offset + limit - 1);

            const { data, error, count } = await query;

            if (error) {
                throw new Error(`Supabase查詢錯誤: ${error.message}`);
            }

            // 格式化數據
            const formattedData = data.map(record => ({
                ...record,
                attendance_type_text: record.attendance_type === 'checkin' ? '上學簽到' : '放學簽退',
                department_text: record.department === 'IT' ? '選手' : record.department,
                location_text: record.location === 'office' ? '選手教室' : 
                              (record.location === 'other' ? '其他' : record.location)
            }));

            return {
                success: true,
                data: formattedData,
                total: count,
                limit: limit,
                offset: offset
            };

        } catch (error) {
            console.error('獲取簽到記錄失敗:', error);
            throw error;
        }
    }

    // 獲取統計信息
    async getStatistics() {
        try {
            if (!this.supabase) {
                await this.initialize();
            }

            // 獲取總記錄數
            const { count: totalCount } = await this.supabase
                .from('attendance_records')
                .select('*', { count: 'exact', head: true });

            // 獲取簽到數
            const { count: checkinCount } = await this.supabase
                .from('attendance_records')
                .select('*', { count: 'exact', head: true })
                .eq('attendance_type', 'checkin');

            // 獲取簽退數
            const { count: checkoutCount } = await this.supabase
                .from('attendance_records')
                .select('*', { count: 'exact', head: true })
                .eq('attendance_type', 'checkout');

            // 獲取今日記錄數
            const today = new Date().toISOString().split('T')[0];
            const { count: todayCount } = await this.supabase
                .from('attendance_records')
                .select('*', { count: 'exact', head: true })
                .eq('attendance_date', today);

            return {
                success: true,
                data: {
                    total: totalCount || 0,
                    checkins: checkinCount || 0,
                    checkouts: checkoutCount || 0,
                    today: todayCount || 0
                }
            };

        } catch (error) {
            console.error('獲取統計信息失敗:', error);
            throw error;
        }
    }

    // 測試連接
    async testConnection() {
        try {
            if (!this.supabase) {
                await this.initialize();
            }

            // 測試基本查詢
            const { data, error } = await this.supabase
                .from('attendance_records')
                .select('count', { count: 'exact', head: true });

            if (error) {
                throw new Error(`Supabase連接測試失敗: ${error.message}`);
            }

            return {
                success: true,
                message: 'Supabase連接測試成功'
            };

        } catch (error) {
            console.error('Supabase連接測試失敗:', error);
            throw error;
        }
    }
}

// 全局簽到管理器實例
window.attendanceManager = new AttendanceManager();

// 導出類供外部使用
window.AttendanceManager = AttendanceManager;

// 頁面載入完成後自動初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('頁面載入完成，開始初始化AttendanceManager...');
    if (window.attendanceManager) {
        console.log('AttendanceManager已創建，嘗試初始化...');
        // 不等待初始化完成，讓它在後台進行
        window.attendanceManager.initialize().catch(error => {
            console.warn('AttendanceManager自動初始化失敗:', error);
        });
    } else {
        console.error('AttendanceManager未創建');
    }
});

// 如果DOMContentLoaded已經觸發，立即嘗試初始化
if (document.readyState === 'loading') {
    // 文檔仍在載入中，等待DOMContentLoaded
} else {
    // 文檔已經載入完成，立即初始化
    console.log('文檔已載入完成，立即初始化AttendanceManager...');
    if (window.attendanceManager) {
        window.attendanceManager.initialize().catch(error => {
            console.warn('AttendanceManager立即初始化失敗:', error);
        });
    }
}
