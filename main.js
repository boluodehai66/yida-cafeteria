// ================= 全局状态管理 =================
const API_BASE_URL = 'http://localhost:5000';

let cart = {};
let previewCart = {};
let currentMenuData = [];

// 🌟 核心修复：直接从浏览器的“记忆”里找人！如果存了学号，就自动恢复登录状态
let currentUser = localStorage.getItem('studentId') ? {
    studentId: localStorage.getItem('studentId'),
    name: localStorage.getItem('userName'),
    balance: parseFloat(localStorage.getItem('userBalance')) || 100.0,
    gender: localStorage.getItem('userGender'),
    age: localStorage.getItem('userAge'),
    height: localStorage.getItem('userHeight'),
    weight: localStorage.getItem('userWeight'),
    bodyFat: localStorage.getItem('userBodyFat')
} : null;

let pendingAction = null;
const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
let realToday = "";
let currentDay = "";
let previewDraftDay = "";
let currentCampus = "北区";
let currentFloor = "一楼";


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

// ==========================================================
// 🌟 核心修改：带导航高亮的区域切换函数
// ==========================================================
function showSection(sectionId) {
    // 1. 隐藏所有区域
    document.getElementById('menuSection').style.display = 'none';
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('profileSection').style.display = 'none';
    document.getElementById('historySection').style.display = 'none';
    document.getElementById('receiptSection').style.display = 'none';

    // 2. 🌟 清除所有导航按钮的高亮状态
    document.querySelectorAll('.fab-btn.nav-item').forEach(btn => btn.classList.remove('active'));

    // 3. 显示目标区域并激活对应按钮
    if(sectionId === 'menuSection') {
        document.getElementById(sectionId).style.display = 'flex';
        document.getElementById('nav-home').classList.add('active'); // 激活首页高亮
    } else {
        document.getElementById(sectionId).style.display = 'block';

        // 根据进入的区域，点亮对应的按钮
        if(sectionId === 'profileSection') document.getElementById('nav-profile').classList.add('active');
        if(sectionId === 'historySection') document.getElementById('nav-history').classList.add('active');
    }
}

function goHome() {
    showLoadingTransition("🏠", "返回大厅", "正在为您准备新鲜菜单...", 800, () => {
        showSection('menuSection');
    });
}

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
// ================= 2. 菜单数据获取与渲染 =================
function fetchMenu(day) {
    document.getElementById('menuArea').innerHTML = `<h3 style="text-align:center; color:#666; width:100%;">⏳ 正在从本地数据库加载多校区菜单...</h3>`;

    // 🌟 核心修改：向本地 Python 接口请求时，带上校区和楼层参数！
    fetch(`${API_BASE_URL}/api/menu?day=${day}&campus=${currentCampus}&floor=${currentFloor}`)
        .then(res => res.json())
        .then(data => {
            currentMenuData = data;
            renderMenu(data);
        })
        .catch(err => {
            console.error(err);
            customAlert("❌ 错误", "无法连接到本地数据库，请确保 Python 后端已启动！");
        });
}

// 🌟 新增：切换校区的函数
function switchCampus(campus, btn) {
    currentCampus = campus;
    // 改变按钮的激活样式
    document.querySelectorAll('.campus-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // 立即重新拉取当前日期的该校区菜单
    fetchMenu(currentDay);
}

// 🌟 新增：切换楼层的函数
function switchFloor(floor, btn) {
    currentFloor = floor;
    // 改变按钮的激活样式
    document.querySelectorAll('.floor-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // 立即重新拉取当前日期的该楼层菜单
    fetchMenu(currentDay);
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
            // 🌟 Pro级修复：强制URL中文编码 + 跨域端口直连 + 智能图片兜底机制
            let safeName = encodeURIComponent(item.name);
            let finalImageUrl = `${API_BASE_URL}/static/images/${safeName}.jpg`;
            let fallbackUrl = `https://ui-avatars.com/api/?name=${safeName}&background=random&color=fff&size=250&font-size=0.3&length=4`;

            contentHtml += `
                <div class="menu-item">
                    <img src="${finalImageUrl}" onerror="this.onerror=null; this.src='${fallbackUrl}';" alt="${item.name}" style="width:100%; height:150px; border-radius:8px; object-fit: cover; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
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
function login() {
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
            // 🌟 核心修复：登录不仅读取后端数据，还要把本地的健康数据也重新挂载上！
            currentUser = {
                name,
                studentId,
                ...data.user,
                gender: localStorage.getItem('userGender'),
                age: localStorage.getItem('userAge'),
                height: localStorage.getItem('userHeight'),
                weight: localStorage.getItem('userWeight'),
                bodyFat: localStorage.getItem('userBodyFat')
            };

            // 把基础信息锁进本地记忆
            localStorage.setItem('studentId', studentId);
            localStorage.setItem('userName', name);
            localStorage.setItem('userBalance', data.user.balance || 100.0);

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

    // 🌟 新增：退出登录时，把浏览器里的记忆全部抹除
    localStorage.removeItem('studentId');
    localStorage.removeItem('userName');
    localStorage.removeItem('userBalance');

    customAlert("👋 提示", "已安全退出登录，餐盘已清空。");
    goHome();
}


// ================= 4. 个人中心与历史 =================
function showProfile() {
    // 🌟 双重校验：检查本地存储的学号
    const savedStudentId = localStorage.getItem('studentId');
    const savedUserName = localStorage.getItem('userName');

    if (!savedStudentId) {
        pendingAction = 'profile'; // 保留你原有的防丢逻辑
        customAlert("🔒 需要登录", "登录状态已失效，请重新登录！").then(() => {
            showSection('loginSection');
        });
        return;
    }

    // 动态修复 currentUser 状态（如果你一刷新页面导致它变回 null 了）
    if (!currentUser) {
        currentUser = {
            studentId: savedStudentId,
            name: savedUserName,
            balance: parseFloat(localStorage.getItem('userBalance')) || 100.0,
            gender: localStorage.getItem('userGender'),
            age: localStorage.getItem('userAge'),
            height: localStorage.getItem('userHeight'),
            weight: localStorage.getItem('userWeight'),
            bodyFat: localStorage.getItem('userBodyFat')
        };
    }

    // 🌟 保留你原有的完美 UI 渲染逻辑
    if (currentUser.name) {
        document.getElementById('profileAvatar').innerHTML = `<div style="width:100%; height:100%; display:flex; justify-content:center; align-items:center; background:#4CAF50; color:white; font-size:24px; font-weight:bold;">${currentUser.name.slice(-2)}</div>`;
    }

    document.getElementById('pfGender').value = currentUser.gender || '';
    document.getElementById('pfAge').value = currentUser.age || '';
    document.getElementById('pfHeight').value = currentUser.height || '';
    document.getElementById('pfWeight').value = currentUser.weight || '';
    document.getElementById('pfFatRate').value = currentUser.bodyFat || '';

    document.getElementById('pfNickname').value = localStorage.getItem('userNickname') || '';
    document.getElementById('pfRealName').value = localStorage.getItem('userName') || '';

    calculateHealthData();

    // 🌟 在这里加上毛玻璃动画：幕后偷偷切换到 profileSection
    showLoadingTransition("👤", "加载档案中", "正在从云端同步您的健康与体测数据...", 1200, () => {
        showSection('profileSection');
    });
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

async function saveProfile() {
    // 提取你页面上填写的健康数据
    const gender = document.getElementById('pfGender').value;
    const age = document.getElementById('pfAge').value;
    const height = document.getElementById('pfHeight').value;
    const weight = document.getElementById('pfWeight').value;
    const bodyFat = document.getElementById('pfFatRate').value;
    const nickname = document.getElementById('pfNickname').value;
    const realName = document.getElementById('pfRealName').value;

    // 🌟 存入本地记忆，这样不管怎么刷新页面，你的身体数据都在
    localStorage.setItem('userNickname', nickname);
    localStorage.setItem('userName', realName);
    localStorage.setItem('userGender', gender);
    localStorage.setItem('userAge', age);
    localStorage.setItem('userHeight', height);
    localStorage.setItem('userWeight', weight);
    localStorage.setItem('userBodyFat', bodyFat);

    // 同步更新当前用户的变量


    if (currentUser) {
        currentUser.name = realName;
        currentUser.nickname = nickname;
        currentUser.gender = gender;
        currentUser.age = age;
        currentUser.height = height;
        currentUser.weight = weight;
        currentUser.bodyFat = bodyFat;
        calculateHealthData(); // 更新你的健康分析展示
    }

    // 完美调用你自己的自定义弹窗
    await customAlert("✅ 保存成功", "您的个人健康档案已成功保存！");
    goHome(); // 安全退回点餐主页面
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
                    // 🌟 核心修复：直接使用后端传过来的 items_desc 字符串，按照逗号拆分成列表！
                    let itemsArray = order.items_desc ? order.items_desc.split(', ') : ['未知菜品'];
                    let itemsHtml = itemsArray.map(item => `<li>${item}</li>`).join('');

                    html += `
                        <div style="background:#f9f9f9; padding:15px; border-radius:8px; margin-bottom:15px; cursor:pointer;" onclick="toggleOrderDetails('order_${index}')">
                            <div style="display:flex; justify-content:space-between; font-weight:bold;">
                                <span>📅 ${order.time}</span>
                                <span style="color:#ff9800;">¥${order.total_price} ▼</span>
                            </div>
                            <ul id="order_${index}" style="display:none; margin-top:15px; padding-left:20px; color:#555; border-top:1px dashed #ccc; padding-top:10px;">
                                ${itemsHtml}
                            </ul>
                        </div>
                    `;
                });
                document.getElementById('historyList').innerHTML = html;
            }
            showLoadingTransition("📜", "翻阅账单中", "正在努力为您拉取历史订单记录...", 1200, () => {
                showSection('historySection');
            });
        })
        .catch(err => {
            console.error("历史订单获取失败:", err);
            customAlert("❌ 网络错误", "无法连接到服务器，请重试。");
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
            const sourceText = data.source === 'local_lora' ? '本地 LoRA 模型' : '智能兜底算法';
            customAlert("✅ 规划完成", `${data.reason || '已生成最贴合目标的搭配。'}\n\n来源：${sourceText}。快看看【规划预览草稿】吧！`);
        } else {
            customAlert("❌ 测算失败", data.message || "模型测算遇到一点问题，请重试。");
        }
    })
    .catch(err => {
        console.error(err);
        customAlert("❌ 网络错误", "无法连接到 AI 模型，请检查后端运行状态。");
    });
}

// 🌟 独家高级 UI 组件：毛玻璃质感弹窗
function showCustomAlert(message, callback) {
    const existing = document.getElementById('glass-alert-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'glass-alert-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.2); 
        backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        display: flex; justify-content: center; align-items: center;
        z-index: 99999; opacity: 0; transition: opacity 0.3s ease;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
        background: rgba(255, 255, 255, 0.85); 
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        padding: 30px 40px; border-radius: 20px; 
        box-shadow: 0 15px 35px rgba(0,0,0,0.1); border: 1px solid rgba(255,255,255,0.6);
        text-align: center; max-width: 320px; transform: scale(0.8); 
        transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;

    modal.innerHTML = `
        <div style="font-size: 45px; margin-bottom: 10px;">✨</div>
        <h3 style="margin: 0 0 10px 0; color: #333; font-size: 18px;">系统提示</h3>
        <p style="margin: 0 0 25px 0; color: #666; font-size: 15px; line-height: 1.5;">${message}</p>
        <button id="glass-alert-btn" style="
            background: #4CAF50; color: white; border: none; padding: 10px 35px;
            border-radius: 30px; font-size: 16px; cursor: pointer; font-weight: bold;
            box-shadow: 0 4px 15px rgba(76,175,80,0.3); transition: transform 0.2s;
        ">确 认</button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    setTimeout(() => {
        overlay.style.opacity = '1';
        modal.style.transform = 'scale(1)';
    }, 10);

    const btn = document.getElementById('glass-alert-btn');
    btn.onmouseover = () => btn.style.transform = 'translateY(-2px)';
    btn.onmouseout = () => btn.style.transform = 'translateY(0)';
    btn.onclick = () => {
        overlay.style.opacity = '0';
        modal.style.transform = 'scale(0.8)';
        setTimeout(() => {
            overlay.remove();
            if (callback) callback();
        }, 300);
    };
}

// ==========================================================
// 🌟 核心修复：补全缺失的 checkout 结账函数
// ==========================================================
function checkout() {
    // 1. 检查是否为空
    if (Object.keys(cart).length === 0) {
        return customAlert("提示", "你的餐盘空空如也，先去加点菜吧！");
    }

    // 2. 检查是否登录
    if (!currentUser) {
        pendingAction = 'checkout'; // 记住我要结账，登完录直接跳回来
        return customAlert("🔒 需要登录", "请先登录才能下单结账哦！").then(() => {
            showSection('loginSection');
        });
    }

    // 3. 计算总价并打包菜品清单
    let totalPrice = 0;
    let totalCals = 0;
    let orderDetails = [];

    for (let id in cart) {
        let item = cart[id];
        totalPrice += item.price * item.quantity;
        totalCals += item.calories * item.quantity;
        orderDetails.push({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            price: item.price * item.quantity,
            calories: item.calories * item.quantity
        });
    }

    let now = new Date();
    let timeString = now.toLocaleString();

    // 4. 发送给后端的 /api/checkout 接口
    fetch(`${API_BASE_URL}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            student_id: currentUser.studentId,
            total_price: totalPrice,
            total_calories: totalCals,
            items: orderDetails,
            date: timeString
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            // 后端扣款成功，更新本地余额
            currentUser.balance = data.balance;
            localStorage.setItem('userBalance', data.balance);

            // 弹出小票
            generateReceipt(totalPrice, totalCals, orderDetails, timeString);
        } else {
            customAlert("❌ 下单失败", data.message);
        }
    })
    .catch(err => {
        console.error(err);
        customAlert("❌ 网络错误", "无法连接到服务器，请检查后端运行状态。");
    });
}

// 5. 覆盖重写原本的生成小票函数，让它变得更纯粹，只负责显示
function generateReceipt(totalPrice, totalCals, orderDetails, timeString) {
    let receiptHtml = `<p><strong>🧑‍🎓 顾客信息：</strong>${currentUser.name} (${currentUser.studentId})</p><hr>`;

    orderDetails.forEach(item => {
        receiptHtml += `<p>${item.name} x${item.quantity} <span style="float:right;">¥${item.price.toFixed(1)} (🔥 ${item.calories} kcal)</span></p>`;
    });

    receiptHtml += `<hr>
        <h3 style="text-align:right;">💰 总计支付: ¥${totalPrice.toFixed(1)}</h3>
        <h4 style="text-align:right; color:#4CAF50;">🔥 摄入总热量: ${totalCals} kcal</h4>
        <p style="text-align:right; font-size:12px; color:#888;">下单时间: ${timeString}</p>
        <p style="text-align:center; color:#ff9800; font-weight:bold; margin-top:20px;">请凭此页面前往食堂对应窗口取餐</p>`;

    document.getElementById('receiptContent').innerHTML = receiptHtml;

    // 🌟 新增：生成小票的加载动画
    showLoadingTransition("🧾", "出票中", "付款成功！正在为您打印云端小票...", 1500, () => {
        showSection('receiptSection');
        cart = {};
        updateCart();
    });
}

// ==========================================================
// 🌟 高级毛玻璃加载过渡动画 (通用版)
// ==========================================================
// ==========================================================
// 🌟 高级毛玻璃加载过渡动画 (通用版)
// ==========================================================
function showLoadingTransition(emoji, title, message, duration, callback) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(255, 255, 255, 0.3);
        backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        display: flex; justify-content: center; align-items: center;
        z-index: 99999; opacity: 0; transition: opacity 0.4s ease;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
        background: rgba(255, 255, 255, 0.9);
        padding: 40px 50px; border-radius: 24px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.08); border: 1px solid rgba(255,255,255,0.8);
        text-align: center; max-width: 350px;
        transform: scale(0.8) translateY(20px);
        transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;

    modal.innerHTML = `
        <div style="font-size: 50px; margin-bottom: 15px; animation: float 2s ease-in-out infinite;">${emoji}</div>
        <h3 style="margin: 0 0 10px 0; color: #2e7d32; font-size: 22px; font-weight: bold;">${title}</h3>
        <p style="margin: 0 0 25px 0; color: #666; font-size: 15px; line-height: 1.6;">${message}</p>
        <div style="display: flex; justify-content: center; gap: 8px;">
            <div class="dot" style="width:10px; height:10px; background:#4CAF50; border-radius:50%; animation: bounce 1.4s infinite ease-in-out both;"></div>
            <div class="dot" style="width:10px; height:10px; background:#4CAF50; border-radius:50%; animation: bounce 1.4s infinite ease-in-out both; animation-delay: -0.32s;"></div>
            <div class="dot" style="width:10px; height:10px; background:#4CAF50; border-radius:50%; animation: bounce 1.4s infinite ease-in-out both; animation-delay: -0.16s;"></div>
        </div>
    `;

    if (!document.getElementById('transition-styles')) {
        const style = document.createElement('style');
        style.id = 'transition-styles';
        style.innerHTML = `
            @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
            @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
        `;
        document.head.appendChild(style);
    }

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    setTimeout(() => {
        overlay.style.opacity = '1';
        modal.style.transform = 'scale(1) translateY(0)';
    }, 10);

    // 1. 遮罩入场
    setTimeout(() => {
        overlay.style.opacity = '1';
        modal.style.transform = 'scale(1) translateY(0)';
    }, 10);

    // 2. 🌟 核心魔术：在遮罩完全变浓的时候（400ms），立刻在幕后执行换页/DOM切换！
    setTimeout(() => {
        if (callback) callback();
    }, 400);

    // 3. 遮罩退场（对于跳转去新页面的操作，这步甚至不会被用户看到，完美衔接）
    setTimeout(() => {
        overlay.style.opacity = '0';
        modal.style.transform = 'scale(0.9) translateY(-20px)';
        setTimeout(() => {
            overlay.remove();
        }, 400);
    }, duration);
}

// 跳转到 AI 的专属函数
function goToAIChat() {
    showLoadingTransition("🪄", "连接 AI 大脑", "正在启动云端推理模型，即将进入沉浸式空间...", 1800, () => {
        window.location.href = 'ai_chat.html';
    });
}