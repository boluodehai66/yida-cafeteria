// ================= 全局状态管理 =================
// 既然在本地运行，这里直接指向本地的 Flask 服务器
const API_BASE_URL = 'https://banish-monstrous-abroad.ngrok-free.dev';

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

// 【彻底恢复直连数据库】
// 修改 main.js 中的 fetchMenu 函数
function fetchMenu(day) {
    document.getElementById('menuArea').innerHTML = `<h3>⏳ 加载中...</h3>`;
    
    fetch(`${API_BASE_URL}/api/menu?day=${day}`, {
        headers: {
            "ngrok-skip-browser-warning": "true" // 🌟 必须加上这一行来跳过 ngrok 的警告页
        }
    })
    .then(res => res.json())
    .then(data => {
        currentMenuData = data;
        renderMenu(data);
    })
    .catch(err => {
        console.error("连接失败:", err);
        document.getElementById('menuArea').innerHTML = `<h3>❌ 无法连接服务器，请检查后端和 ngrok 状态</h3>`;
    });
}

// 核心功能：分栏渲染逻辑
function renderMenu(menuData) {
    const menuArea = document.getElementById('menuArea');
    menuArea.innerHTML = '';

    if (!menuData || menuData.length === 0) {
        menuArea.innerHTML = `<h3 style="text-align:center; color:#666; width:100%; margin-top:50px;">今日暂无菜单数据</h3>`;
        return;
    }

    // 1. 将数据按分类进行分组
    const categories = {};
    menuData.forEach(item => {
        // 如果后端返回的类别名字和前端对不上，这里会自动处理
        let cat = item.category || '其他';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(item);
    });

    // 2. 定义要求的分类显示顺序
    const categoryOrder = ["主食", "荤菜", "素菜", "小吃", "汤羹"];

    // 获取并排序分类键名
    const sortedCatNames = Object.keys(categories).sort((a, b) => {
        let indexA = categoryOrder.indexOf(a);
        let indexB = categoryOrder.indexOf(b);
        if (indexA === -1) indexA = 999;
        if (indexB === -1) indexB = 999;
        return indexA - indexB;
    });

    // 3. 初始化左侧导航和右侧内容区的 HTML 容器
    let sidebarHtml = `<div class="category-sidebar">`;
    let contentHtml = `<div class="menu-content" id="menuScrollContent">`;

    let isFirst = true;

    // 4. 按照排序后的顺序生成 HTML
    sortedCatNames.forEach(cat => {
        // 生成左侧的锚点按钮
        sidebarHtml += `<button class="category-btn ${isFirst ? 'active' : ''}" onclick="scrollToCategory('${cat}')">${cat}</button>`;

        // 生成右侧的菜品区块
        contentHtml += `<div id="cat-${cat}"><h2 class="category-title">${cat}</h2><div class="menu-grid">`;

        categories[cat].forEach(item => {
            let buttonHTML = '';
            if (currentDay === realToday) {
                buttonHTML += `<button class="btn-add" onclick='addToCart(${JSON.stringify(item)})'>🛒 下单</button>`;
                buttonHTML += `<button class="btn-preview" onclick='addToPreview(${JSON.stringify(item)})'>📅 测算</button>`;
            } else {
                buttonHTML += `<button class="btn-preview" onclick='addToPreview(${JSON.stringify(item)})'>📅 加入规划测算</button>`;
            }

            // 继续使用好看的动态生成图片，或者你可以改为 ${item.image} 使用数据库里的图片
            let generatedImageUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=random&color=fff&size=250&font-size=0.3&length=4`;

            contentHtml += `
                <div class="menu-item">
                    <img src="${generatedImageUrl}" alt="${item.name}" style="width:100%; height:150px; border-radius:8px; object-fit: cover; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <h4 style="margin:5px 0; font-size:14px;">${item.name}</h4>
                    <p style="color:#ff9800; font-weight:bold; margin:5px 0;">¥${item.price}</p>
                    <p style="font-size:12px; color:#4CAF50; margin:5px 0;">🔥 ${item.calories} kcal</p>
                    <p style="font-size:10px; color:#888; margin-bottom:10px;">碳水${item.carbs || '-'} | 蛋白${item.protein || '-'} | 脂肪${item.fat || '-'}</p>
                    <div class="button-group">${buttonHTML}</div>
                </div>
            `;
        });
        contentHtml += `</div></div>`;
        isFirst = false;
    });

    sidebarHtml += `</div>`;
    contentHtml += `</div>`;

    // 5. 将拼接好的两大块 HTML 塞入页面
    menuArea.innerHTML = sidebarHtml + contentHtml;

    // 6. 绑定滚动监听，实现左侧导航的联动高亮
    setupScrollSpy();
}

// ============== 双向滚动联动逻辑 ==============
function setupScrollSpy() {
    const scrollContainer = document.getElementById('menuScrollContent');
    if (!scrollContainer) return;

    const sections = document.querySelectorAll('.menu-content > div[id^="cat-"]');
    const navButtons = document.querySelectorAll('.category-btn');

    scrollContainer.addEventListener('scroll', () => {
        let currentCat = "";
        const scrollTop = scrollContainer.scrollTop;

        sections.forEach(section => {
            const sectionTop = section.offsetTop - scrollContainer.offsetTop - 50;
            if (scrollTop >= sectionTop) {
                currentCat = section.id.replace('cat-', '');
            }
        });

        if (Math.ceil(scrollTop + scrollContainer.clientHeight) >= scrollContainer.scrollHeight - 10) {
            currentCat = sections[sections.length - 1].id.replace('cat-', '');
        }

        if (currentCat) {
            navButtons.forEach(btn => {
                if (btn.innerText === currentCat) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
    });
}
// ==========================================================

function scrollToCategory(catName) {
    const targetDiv = document.getElementById(`cat-${catName}`);
    const scrollContainer = document.getElementById('menuScrollContent');

    if (targetDiv && scrollContainer) {
        scrollContainer.scrollTo({
            top: targetDiv.offsetTop - scrollContainer.offsetTop,
            behavior: 'smooth'
        });
    }

    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.innerText === catName) {
            btn.classList.add('active');
        }
    });
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
            headers: { 'Content-Type': 'application/json' },
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

    fetch(`${API_BASE_URL}/api/history?student_id=${currentUser.studentId}`)
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
        <p style="font-size:12px; color:#666;">算法将调用后端的 AI 模型，为您生成三餐最优搭配。</p>
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

    customAlert("⏳ AI 思考中", "强大的 AI 测算模型正在为您匹配最优方案，请稍候...");

    const requestData = {
        budget: totalBudget,
        calories: totalCals,
        day: currentDay
    };

    fetch(`${API_BASE_URL}/api/ai_plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            previewCart = {};
            previewDraftDay = currentDay;

            const recommendedIds = data.recommended_ids;

            recommendedIds.forEach(id => {
                let bestItem = currentMenuData.find(item => item.id === id);
                if (bestItem) {
                    if (previewCart[bestItem.id]) previewCart[bestItem.id].quantity += 1;
                    else previewCart[bestItem.id] = { ...bestItem, quantity: 1 };
                }
            });

            updatePreviewCart();
            goHome();
            customAlert("✅ 规划完成", "AI 模型已成功为您生成最贴合目标的搭配！快看看【规划预览草稿】吧！");
        } else {
            customAlert("❌ 测算失败", data.message || "模型测算遇到一点问题，请重试。");
        }
    })
    .catch(err => {
        console.error(err);
        customAlert("❌ 网络错误", "无法连接到 AI 模型，请检查后端运行状态。");
    });
}