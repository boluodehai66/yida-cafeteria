// 全局状态管理
const API_BASE_URL = 'https://unsocial-sphinx-catacomb.ngrok-free.dev';

let cart = {};
let previewCart = {};
let currentMenuData = [];
let currentUser = null;
let pendingAction = null;
const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
let realToday = "";
let currentDay = "";
let previewDraftDay = "";

window.onload = () => {
    let dayIndex = new Date().getDay();
    let mapping = {0: "周日", 1: "周一", 2: "周二", 3: "周三", 4: "周四", 5: "周五", 6: "周六"};
    realToday = mapping[dayIndex];
    currentDay = realToday;

    renderNav();
    switchDay(currentDay);
};

// ================= 1. 基础 UI 与模态框 =================
function renderNav() {
    const navDiv = document.getElementById('weekNav');
    navDiv.innerHTML = '';
    days.forEach(day => {
        let btn = document.createElement('button');
        btn.className = `day-btn ${day === currentDay ? 'active' : ''} ${day === realToday ? 'today-marker' : ''}`;
        btn.innerText = day;
        btn.onclick = () => switchDay(day);
        navDiv.appendChild(btn);
    });
}

function showSection(sectionId) {
    document.getElementById('menuSection').style.display = 'none';
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('profileSection').style.display = 'none';
    document.getElementById('historySection').style.display = 'none';
    document.getElementById('receiptSection').style.display = 'none';

    if(sectionId === 'menuSection') {
        document.getElementById(sectionId).style.display = 'flex';
    } else {
        document.getElementById(sectionId).style.display = 'block';
    }
}

function goHome() { showSection('menuSection'); }

function customAlert(title, message) {
    return new Promise(resolve => {
        const overlay = document.getElementById('customModalOverlay');
        document.getElementById('customModalTitle').innerText = title;
        document.getElementById('customModalMessage').innerText = message;
        document.getElementById('customModalInput').style.display = 'none';
        document.getElementById('customModalCancelBtn').style.display = 'none';

        const confirmBtn = document.getElementById('customModalConfirmBtn');
        confirmBtn.onclick = () => { overlay.style.display = 'none'; resolve(true); };
        overlay.style.display = 'flex';
    });
}

function customConfirm(title, message) {
    return new Promise(resolve => {
        const overlay = document.getElementById('customModalOverlay');
        document.getElementById('customModalTitle').innerText = title;
        document.getElementById('customModalMessage').innerText = message;
        document.getElementById('customModalInput').style.display = 'none';

        const cancelBtn = document.getElementById('customModalCancelBtn');
        const confirmBtn = document.getElementById('customModalConfirmBtn');
        cancelBtn.style.display = 'inline-block';

        cancelBtn.onclick = () => { overlay.style.display = 'none'; resolve(false); };
        confirmBtn.onclick = () => { overlay.style.display = 'none'; resolve(true); };
        overlay.style.display = 'flex';
    });
}

// ================= 2. 菜单与购物车逻辑 =================
function switchDay(day) {
    currentDay = day;
    renderNav();
    fetchMenu(day);
}

function fetchMenu(day) {
    document.getElementById('menuArea').innerHTML = `<h3 style="text-align:center; color:#666;">⏳ 正在加载菜单...</h3>`;
    // 【关键修复】加上 Ngrok 免拦截通行证
    fetch(`${API_BASE_URL}/api/menu?day=${day}`, {
        headers: { 'ngrok-skip-browser-warning': 'true' }
    })
        .then(res => res.json())
        .then(data => {
            currentMenuData = data;
            renderMenu(data);
        })
        .catch(err => {
            console.error(err);
            customAlert("❌ 错误", "无法连接到服务器，请检查后端和Ngrok是否运行。");
        });
}

function renderMenu(menuData) {
    const menuArea = document.getElementById('menuArea');
    menuArea.innerHTML = '';

    const categories = {};
    menuData.forEach(item => {
        if (!categories[item.category]) categories[item.category] = [];
        categories[item.category].push(item);
    });

    for (let cat in categories) {
        let catHtml = `<h2 class="category-title">${cat}</h2><div class="menu-grid">`;
        categories[cat].forEach(item => {
            let buttonHTML = '';
            if (currentDay === realToday) {
                buttonHTML += `<button class="btn-add" onclick='addToCart(${JSON.stringify(item)})'>🛒 下单</button>`;
                buttonHTML += `<button class="btn-preview" onclick='addToPreview(${JSON.stringify(item)})'>📅 测算</button>`;
            } else {
                buttonHTML += `<button class="btn-preview" onclick='addToPreview(${JSON.stringify(item)})'>📅 加入规划测算</button>`;
            }

            catHtml += `
                <div class="menu-item">
                    <img src="${item.image}" alt="${item.name}">
                    <h4 style="margin:5px 0;">${item.name}</h4>
                    <p style="color:#ff9800; font-weight:bold; margin:5px 0;">¥${item.price}</p>
                    <p style="font-size:12px; color:#4CAF50; margin:5px 0;">🔥 ${item.calories} kcal</p>
                    <p style="font-size:11px; color:#888; margin-bottom:10px;">碳水 ${item.carbs || '--'}g | 蛋白 ${item.protein || '--'}g | 脂肪 ${item.fat || '--'}g</p>
                    <div class="button-group">${buttonHTML}</div>
                </div>
            `;
        });
        catHtml += `</div>`;
        menuArea.innerHTML += catHtml;
    }
}

function addToCart(item) {
    if (cart[item.id]) { cart[item.id].quantity += 1; }
    else { cart[item.id] = { ...item, quantity: 1 }; }
    updateCart();
}

function removeFromCart(id) {
    if (cart[id]) {
        cart[id].quantity -= 1;
        if (cart[id].quantity <= 0) delete cart[id];
        updateCart();
    }
}

async function clearCart() {
    if (Object.keys(cart).length === 0) return;
    const confirm = await customConfirm("🗑️ 确认清空", "确定要清空今日结算餐盘里的所有菜品吗？");
    if (confirm) { cart = {}; updateCart(); }
}

function updateCart() {
    const cartDiv = document.getElementById('cartItems');
    cartDiv.innerHTML = '';
    let total = 0, totalCals = 0, totalCarbs = 0, totalProtein = 0, totalFat = 0;

    for (let id in cart) {
        let item = cart[id];
        total += item.price * item.quantity;
        totalCals += item.calories * item.quantity;
        totalCarbs += (item.carbs || 0) * item.quantity;
        totalProtein += (item.protein || 0) * item.quantity;
        totalFat += (item.fat || 0) * item.quantity;

        cartDiv.innerHTML += `
            <div class="cart-item">
                <div>
                    <span style="font-weight:bold;">${item.name}</span> x${item.quantity}<br>
                    <span style="font-size:12px; color:#4CAF50;">🔥 ${item.calories * item.quantity} kcal</span>
                </div>
                <div>
                    <span style="color:#ff9800; margin-right:10px;">¥${item.price * item.quantity}</span>
                    <button onclick="removeFromCart(${id})" style="background:#f44336; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">-1</button>
                </div>
            </div>
        `;
    }
    document.getElementById('totalPrice').innerText = total;
    document.getElementById('totalCalories').innerText = totalCals;
    document.getElementById('totalCarbs').innerText = totalCarbs;
    document.getElementById('totalProtein').innerText = totalProtein;
    document.getElementById('totalFat').innerText = totalFat;
}

function addToPreview(item) {
    if (Object.keys(previewCart).length === 0) previewDraftDay = currentDay;
    else if (previewDraftDay !== currentDay) {
        customAlert("⚠️ 日期冲突", "草稿箱里还有其他日期的菜品，请先清空或采纳。");
        return;
    }

    if (previewCart[item.id]) { previewCart[item.id].quantity += 1; }
    else { previewCart[item.id] = { ...item, quantity: 1 }; }
    updatePreviewCart();
}

function removeFromPreview(id) {
    if (previewCart[id]) {
        previewCart[id].quantity -= 1;
        if (previewCart[id].quantity <= 0) delete previewCart[id];
        updatePreviewCart();
    }
}

async function clearPreviewCart() {
    if (Object.keys(previewCart).length === 0) return;
    const confirm = await customConfirm("🗑️ 确认清空", "确定要清空规划草稿箱吗？");
    if (confirm) { previewCart = {}; previewDraftDay = ""; updatePreviewCart(); }
}

function updatePreviewCart() {
    const previewCartDiv = document.getElementById('previewCartItems');
    previewCartDiv.innerHTML = '';
    let total = 0, totalCals = 0, totalCarbs = 0, totalProtein = 0, totalFat = 0;

    for (let id in previewCart) {
        let item = previewCart[id];
        total += item.price * item.quantity;
        totalCals += item.calories * item.quantity;
        totalCarbs += (item.carbs || 0) * item.quantity;
        totalProtein += (item.protein || 0) * item.quantity;
        totalFat += (item.fat || 0) * item.quantity;

        previewCartDiv.innerHTML += `
            <div class="cart-item">
                <div>
                    <span style="font-weight:bold;">${item.name}</span> x${item.quantity}<br>
                    <span style="font-size:12px; color:#4CAF50;">🔥 ${item.calories * item.quantity} kcal</span>
                </div>
                <div>
                    <span style="color:#ff9800; margin-right:10px;">¥${item.price * item.quantity}</span>
                    <button onclick="removeFromPreview(${id})" style="background:#f44336; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">-1</button>
                </div>
            </div>
        `;
    }
    document.getElementById('previewTotalPrice').innerText = total;
    document.getElementById('previewTotalCalories').innerText = totalCals;
    document.getElementById('previewTotalCarbs').innerText = totalCarbs;
    document.getElementById('previewTotalProtein').innerText = totalProtein;
    document.getElementById('previewTotalFat').innerText = totalFat;
}

function convertPreviewToOrder() {
    if (Object.keys(previewCart).length === 0) return customAlert("提示", "草稿箱是空的哦！");
    if (previewDraftDay !== realToday) return customAlert("❌ 无法采纳", "只能采纳【今天】的方案进行下单哦！");

    for (let id in previewCart) {
        if (cart[id]) cart[id].quantity += previewCart[id].quantity;
        else cart[id] = { ...previewCart[id] };
    }
    previewCart = {};
    previewDraftDay = "";
    updateCart();
    updatePreviewCart();
    customAlert("✅ 采纳成功", "草稿已合并至今日结算餐盘！");
}

// ================= 3. 用户系统 =================
async function login() {
    const name = document.getElementById('loginName').value;
    const studentId = document.getElementById('loginStudentId').value;
    const password = document.getElementById('loginPassword').value;

    if (!name || !studentId || !password) return customAlert("❌ 提示", "请填写完整信息");

    fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ name, studentId, password })
    })
    .then(res => res.json())
    .then(async data => {
        if (data.status === 'success') {
            currentUser = { name, studentId, ...data.user };
            await customAlert("✅ 登录成功", data.message);

            if (pendingAction === 'checkout') { pendingAction = null; checkout(); }
            else if (pendingAction === 'profile') { pendingAction = null; showProfile(); }
            else { goHome(); }
        } else {
            customAlert("❌ 登录失败", data.message);
        }
    });
}

function logout() {
    currentUser = null;
    cart = {}; previewCart = {}; updateCart(); updatePreviewCart();
    customAlert("👋 提示", "已安全退出登录，餐盘已清空。");
    goHome();
}

async function checkout() {
    if (Object.keys(cart).length === 0) return customAlert("提示", "你的餐盘是空的，先点点菜吧！");
    if (!currentUser) {
        pendingAction = 'checkout';
        await customAlert("🔒 需要登录", "请先登录或注册账号再进行结算。");
        showSection('loginSection');
        return;
    }
    generateReceipt();
}

function generateReceipt() {
    let receiptHtml = `<p><strong>🧑‍🎓 顾客信息：</strong>${currentUser.name} (${currentUser.studentId})</p><hr>`;
    let totalPrice = 0; let totalCals = 0; let totalCarbs = 0; let totalProtein = 0; let totalFat = 0;

    let orderDetails = [];
    for (let id in cart) {
        let item = cart[id];
        let linePrice = item.price * item.quantity;
        let lineCals = item.calories * item.quantity;
        totalPrice += linePrice; totalCals += lineCals;
        totalCarbs += (item.carbs || 0) * item.quantity;
        totalProtein += (item.protein || 0) * item.quantity;
        totalFat += (item.fat || 0) * item.quantity;

        orderDetails.push({ id: item.id, name: item.name, quantity: item.quantity, price: linePrice, calories: lineCals });
        receiptHtml += `<p>${item.name} x${item.quantity} <span style="float:right;">¥${linePrice} (🔥 ${lineCals} kcal)</span></p>`;
    }

    let now = new Date();
    let timeString = now.toLocaleString();
    let uniqueOrderId = 'ORD' + Date.now();

    receiptHtml += `<hr>
        <h3 style="text-align:right;">💰 总计支付: ¥${totalPrice}</h3>
        <h4 style="text-align:right; color:#4CAF50;">🔥 摄入总热量: ${totalCals} kcal</h4>
        <p style="text-align:right; font-size:12px; color:#666;">三大营养素: 碳水 ${totalCarbs}g | 蛋白 ${totalProtein}g | 脂肪 ${totalFat}g</p>
        <p style="text-align:right; font-size:12px; color:#888;">下单时间: ${timeString}</p>
        <p style="text-align:center; color:#ff9800; font-weight:bold; margin-top:20px;">请凭此页面前往食堂对应窗口取餐</p>`;

    document.getElementById('receiptContent').innerHTML = receiptHtml;
    showSection('receiptSection');

    fetch(`${API_BASE_URL}/api/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ order_id: uniqueOrderId, student_id: currentUser.studentId, date: now.toLocaleDateString(), time: timeString, total_price: totalPrice, total_calories: totalCals, items: orderDetails })
    });

    cart = {}; updateCart();
}

// ================= 4. 个人中心与历史 =================
async function showProfile() {
    if (!currentUser) {
        pendingAction = 'profile';
        await customAlert("🔒 需要登录", "请先登录查看个人主页。");
        showSection('loginSection');
        return;
    }

    document.getElementById('profileAvatar').innerHTML = `<div style="width:100%; height:100%; display:flex; justify-content:center; align-items:center; background:#4CAF50; color:white; font-size:24px; font-weight:bold;">${currentUser.name.slice(-2)}</div>`;

    document.getElementById('pfGender').value = currentUser.gender || '';
    document.getElementById('pfAge').value = currentUser.age || '';
    document.getElementById('pfHeight').value = currentUser.height || '';
    document.getElementById('pfWeight').value = currentUser.weight || '';
    document.getElementById('pfFatRate').value = currentUser.bodyFat || '';

    calculateHealthData();
    showSection('profileSection');
}

function calculateHealthData() {
    let height = parseFloat(document.getElementById('pfHeight').value);
    let weight = parseFloat(document.getElementById('pfWeight').value);
    let fatRate = parseFloat(document.getElementById('pfFatRate').value);

    let bmiEl = document.getElementById('calcBMI');
    let bmrEl = document.getElementById('calcBMR');

    if (height > 0 && weight > 0) {
        let bmi = weight / Math.pow(height / 100, 2);
        bmiEl.innerText = bmi.toFixed(1);
    } else { bmiEl.innerText = '--'; }

    if (weight > 0 && fatRate > 0) {
        let bmr = 370 + 21.6 * weight * (1 - (fatRate / 100));
        bmrEl.innerText = Math.round(bmr);
    } else { bmrEl.innerText = '-- (需填体脂率)'; }
}

document.getElementById('pfHeight').addEventListener('input', calculateHealthData);
document.getElementById('pfWeight').addEventListener('input', calculateHealthData);
document.getElementById('pfFatRate').addEventListener('input', calculateHealthData);

function saveProfile() {
    const profileData = {
        studentId: currentUser.studentId,
        gender: document.getElementById('pfGender').value,
        age: document.getElementById('pfAge').value,
        height: document.getElementById('pfHeight').value,
        weight: document.getElementById('pfWeight').value,
        bodyFat: document.getElementById('pfFatRate').value
    };

    fetch(`${API_BASE_URL}/api/update_profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify(profileData)
    })
    .then(res => res.json())
    .then(data => {
        if(data.status === 'success') {
            currentUser = { ...currentUser, ...profileData };
            customAlert("✅ 成功", "健康档案保存成功！");
        } else { customAlert("❌ 错误", data.message); }
    });
}

async function triggerPasswordChange() {
    const overlay = document.getElementById('customModalOverlay');
    overlay.style.zIndex = 99999;

    document.getElementById('customModalTitle').innerText = "🔒 安全验证";
    document.getElementById('customModalMessage').innerHTML = `
        <input type="text" id="verifyName" placeholder="确认真实姓名" class="modal-input" style="width:100%; box-sizing:border-box;">
        <input type="password" id="verifyOldPwd" placeholder="输入当前密码" class="modal-input" style="width:100%; box-sizing:border-box;">
        <input type="password" id="verifyNewPwd" placeholder="输入新密码" class="modal-input" style="width:100%; box-sizing:border-box; border:2px solid #ff9800;">
    `;

    const cancelBtn = document.getElementById('customModalCancelBtn');
    const confirmBtn = document.getElementById('customModalConfirmBtn');
    cancelBtn.style.display = 'inline-block';

    cancelBtn.onclick = () => { overlay.style.display = 'none'; };
    confirmBtn.onclick = () => {
        const vName = document.getElementById('verifyName').value;
        const oldP = document.getElementById('verifyOldPwd').value;
        const newP = document.getElementById('verifyNewPwd').value;

        if(vName !== currentUser.name) return alert("姓名不匹配！");
        if(!oldP || !newP) return alert("请填写完整密码信息！");

        fetch(`${API_BASE_URL}/api/change_password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify({ studentId: currentUser.studentId, oldPassword: oldP, newPassword: newP })
        }).then(res=>res.json()).then(async data => {
            overlay.style.display = 'none';
            if(data.status === 'success') {
                await customAlert("✅ 重置成功", "安全要求：请使用新密码重新登录。");
                logout();
            } else { customAlert("❌ 错误", data.message); }
        });
    };
    overlay.style.display = 'flex';
}

async function showHistory() {
    if (!currentUser) return customAlert("🔒 需要登录", "请先登录查看历史订单。");

    fetch(`${API_BASE_URL}/api/history?student_id=${currentUser.studentId}`, {
        headers: { 'ngrok-skip-browser-warning': 'true' }
    })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'error' || !data.orders || data.orders.length === 0) {
                document.getElementById('historyList').innerHTML = '<p style="text-align:center; color:#888;">暂无历史订单</p>';
            } else {
                let html = '';
                data.orders.forEach((order, index) => {
                    let itemsHtml = order.items.map(i => `<li>${i.name} x${i.quantity} (¥${i.price}, 🔥${i.calories}kcal)</li>`).join('');
                    html += `
                        <div style="background:#f9f9f9; padding:15px; border-radius:8px; margin-bottom:15px; cursor:pointer;" onclick="toggleOrderDetails('order_${index}')">
                            <div style="display:flex; justify-content:space-between; font-weight:bold;">
                                <span>📅 ${order.time}</span>
                                <span style="color:#ff9800;">¥${order.total_price} (🔥${order.total_calories} kcal) ▼</span>
                            </div>
                            <ul id="order_${index}" style="display:none; margin-top:15px; padding-left:20px; color:#555; border-top:1px dashed #ccc; padding-top:10px;">
                                ${itemsHtml}
                            </ul>
                        </div>
                    `;
                });
                document.getElementById('historyList').innerHTML = html;
            }
            showSection('historySection');
        });
}

function toggleOrderDetails(id) {
    const el = document.getElementById(id);
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// ================= 5. AI 配餐系统 =================
async function showAIPlanner() {
    const overlay = document.getElementById('customModalOverlay');
    overlay.style.zIndex = 9999;

    document.getElementById('customModalTitle').innerText = "🤖 一日三餐智能规划";
    document.getElementById('customModalMessage').innerHTML = `
        <p style="font-size:12px; color:#666;">算法将基于今天菜单，为您智能生成三餐最优搭配。</p>
        <input type="number" id="aiBudget" placeholder="全天最高预算 (元)" class="modal-input" style="width:100%; box-sizing:border-box;">
        <input type="number" id="aiCalories" placeholder="全天目标热量 (kcal)" class="modal-input" style="width:100%; box-sizing:border-box;">
    `;

    const cancelBtn = document.getElementById('customModalCancelBtn');
    const confirmBtn = document.getElementById('customModalConfirmBtn');
    cancelBtn.style.display = 'inline-block';

    cancelBtn.onclick = () => { overlay.style.display = 'none'; };
    confirmBtn.onclick = () => {
        let budget = parseFloat(document.getElementById('aiBudget').value);
        let cals = parseFloat(document.getElementById('aiCalories').value);

        if(!budget || !cals) {
            overlay.style.zIndex = 999;
            return customAlert("⚠️ 提示", "请输入有效的预算和热量目标！").then(() => overlay.style.zIndex = 9999);
        }

        overlay.style.display = 'none';
        generateAlgorithmRecommendation(budget, cals);
    };
    overlay.style.display = 'flex';
}

function generateAlgorithmRecommendation(totalBudget, totalCals) {
    if(currentMenuData.length === 0) return customAlert("提示", "请先返回首页加载菜单！");

    const targets = [
        { name: "🍳 早餐", b: totalBudget * 0.3, c: totalCals * 0.3 },
        { name: "🍱 午餐", b: totalBudget * 0.4, c: totalCals * 0.4 },
        { name: "🍲 晚餐", b: totalBudget * 0.3, c: totalCals * 0.3 }
    ];

    previewCart = {};
    previewDraftDay = currentDay;

    targets.forEach(target => {
        let bestItem = null;
        let minDiff = Infinity;

        currentMenuData.forEach(item => {
            if(item.price <= target.b) {
                let diff = Math.abs(item.calories - target.c);
                if(diff < minDiff) { minDiff = diff; bestItem = item; }
            }
        });
        if(bestItem) {
            if (previewCart[bestItem.id]) previewCart[bestItem.id].quantity += 1;
            else previewCart[bestItem.id] = { ...bestItem, quantity: 1 };
        }
    });

    updatePreviewCart();
    goHome();
    customAlert("✅ 规划完成", "AI 已将最贴合目标的搭配发送至您的【规划预览草稿】！");
}