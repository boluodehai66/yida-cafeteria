// ================= 全局状态管理 =================
// 🌟 关键：请在此处填入你最新的 ngrok 链接
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

// 页面加载初始化
window.onload = () => {
    let dayIndex = new Date().getDay();
    let mapping = {0: "周日", 1: "周一", 2: "周二", 3: "周三", 4: "周四", 5: "周五", 6: "周六"};
    realToday = mapping[dayIndex];
    currentDay = realToday;

    renderNav();
    switchDay(currentDay);
};

// ================= 1. 基础 UI 与工具函数 =================
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

// 通用配置：为所有 fetch 请求添加 ngrok 跳过警告的 Header
const fetchOptions = {
    headers: { 'ngrok-skip-browser-warning': 'true' }
};

const postOptions = (data) => ({
    method: 'POST',
    headers: { 
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true' 
    },
    body: JSON.stringify(data)
});

// ================= 2. 菜单加载与渲染 (核心逻辑) =================
function switchDay(day) {
    currentDay = day;
    renderNav();
    fetchMenu(day);
}

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

function renderMenu(menuData) {
    const menuArea = document.getElementById('menuArea');
    menuArea.innerHTML = '';

    if (!menuData || menuData.length === 0) {
        menuArea.innerHTML = `<h3 style="text-align:center; color:#666; width:100%; margin-top:50px;">该日期暂无数据</h3>`;
        return;
    }

    // 分类分组
    const categories = {};
    menuData.forEach(item => {
        let cat = item.category || '特色菜品';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(item);
    });

    const categoryOrder = ["主食", "荤菜", "素菜", "小吃", "汤羹"];
    const sortedCatNames = Object.keys(categories).sort((a, b) => {
        let iA = categoryOrder.indexOf(a), iB = categoryOrder.indexOf(b);
        return (iA === -1 ? 99 : iA) - (iB === -1 ? 99 : iB);
    });

    let sidebarHtml = `<div class="category-sidebar">`;
    let contentHtml = `<div class="menu-content" id="menuScrollContent">`;

    sortedCatNames.forEach((cat, idx) => {
        sidebarHtml += `<button class="category-btn ${idx === 0 ? 'active' : ''}" onclick="scrollToCategory('${cat}')">${cat}</button>`;
        contentHtml += `<div id="cat-${cat}"><h2 class="category-title">${cat}</h2><div class="menu-grid">`;

        categories[cat].forEach(item => {
            let actionBtns = '';
            if (currentDay === realToday) {
                actionBtns += `<button class="btn-add" onclick='addToCart(${JSON.stringify(item)})'>🛒 下单</button>`;
                actionBtns += `<button class="btn-preview" onclick='addToPreview(${JSON.stringify(item)})'>📅 测算</button>`;
            } else {
                actionBtns += `<button class="btn-preview" onclick='addToPreview(${JSON.stringify(item)})'>📅 加入规划测算</button>`;
            }

            contentHtml += `
                <div class="menu-item">
                    <img src="${item.image}" alt="${item.name}" loading="lazy">
                    <h4>${item.name}</h4>
                    <p class="price">¥${item.price}</p>
                    <p class="calories">🔥 ${item.calories} kcal</p>
                    <p class="nutrients">碳水${item.carbs} | 蛋白${item.protein} | 脂肪${item.fat}</p>
                    <div class="button-group">${actionBtns}</div>
                </div>
            `;
        });
        contentHtml += `</div></div>`;
    });

    menuArea.innerHTML = sidebarHtml + `</div>` + contentHtml + `</div>`;
    setupScrollSpy(); // 启动滚动联动侦听
}

// ============== 3. 双向滚动联动 (Scroll Spy) ==============
function setupScrollSpy() {
    const scrollContainer = document.getElementById('menuScrollContent');
    if (!scrollContainer) return;

    const sections = document.querySelectorAll('.menu-content > div[id^="cat-"]');
    const navButtons = document.querySelectorAll('.category-btn');

    scrollContainer.addEventListener('scroll', () => {
        let currentCat = "";
        const scrollTop = scrollContainer.scrollTop;

        sections.forEach(section => {
            const sectionTop = section.offsetTop - scrollContainer.offsetTop - 60;
            if (scrollTop >= sectionTop) {
                currentCat = section.id.replace('cat-', '');
            }
        });

        // 触底检测
        if (Math.ceil(scrollTop + scrollContainer.clientHeight) >= scrollContainer.scrollHeight - 10) {
            currentCat = sections[sections.length - 1].id.replace('cat-', '');
        }

        if (currentCat) {
            navButtons.forEach(btn => {
                btn.classList.toggle('active', btn.innerText === currentCat);
            });
        }
    });
}

function scrollToCategory(catName) {
    const targetDiv = document.getElementById(`cat-${catName}`);
    const scrollContainer = document.getElementById('menuScrollContent');
    if (targetDiv && scrollContainer) {
        scrollContainer.scrollTo({
            top: targetDiv.offsetTop - scrollContainer.offsetTop,
            behavior: 'smooth'
        });
    }
}

// ================= 4. 购物车与规划测算 =================
function addToCart(item) {
    if (cart[item.id]) cart[item.id].quantity += 1;
    else cart[item.id] = { ...item, quantity: 1 };
    updateCart();
}

function updateCart() {
    const cartDiv = document.getElementById('cartItems');
    cartDiv.innerHTML = '';
    let tP = 0, tCal = 0, tCb = 0, tPr = 0, tFa = 0;

    for (let id in cart) {
        let it = cart[id];
        let q = it.quantity;
        tP += it.price * q; tCal += it.calories * q;
        tCb += it.carbs * q; tPr += it.protein * q; tFa += it.fat * q;

        cartDiv.innerHTML += `
            <div class="cart-item">
                <span>${it.name} x${q}</span>
                <span>¥${it.price * q} <button onclick="removeFromCart(${id})">-</button></span>
            </div>
        `;
    }
    document.getElementById('totalPrice').innerText = tP;
    document.getElementById('totalCalories').innerText = tCal;
    document.getElementById('totalCarbs').innerText = tCb.toFixed(1);
    document.getElementById('totalProtein').innerText = tPr.toFixed(1);
    document.getElementById('totalFat').innerText = tFa.toFixed(1);
}

function removeFromCart(id) {
    if (cart[id].quantity > 1) cart[id].quantity--;
    else delete cart[id];
    updateCart();
}

// ... 规划测算相关函数 (addToPreview, updatePreviewCart) 逻辑与购物车类似，此处略以节省空间 ...

// ================= 5. AI 测算模型接入 (重点) =================
async function showAIPlanner() {
    const overlay = document.getElementById('customModalOverlay');
    document.getElementById('customModalTitle').innerText = "🤖 接入 AI 模型测算";
    document.getElementById('customModalMessage').innerHTML = `
        <p style="font-size:12px;">正在调用您开发的大模型进行智能配餐...</p>
        <input type="number" id="aiBudget" placeholder="全天预算 (元)" class="modal-input">
        <input type="number" id="aiCalories" placeholder="目标热量 (kcal)" class="modal-input">
    `;
    document.getElementById('customModalCancelBtn').style.display = 'inline-block';
    document.getElementById('customModalConfirmBtn').onclick = () => {
        let budget = parseFloat(document.getElementById('aiBudget').value);
        let cals = parseFloat(document.getElementById('aiCalories').value);
        if(!budget || !cals) return alert("请完整填写目标！");
        overlay.style.display = 'none';
        generateAIPlan(budget, cals);
    };
    overlay.style.display = 'flex';
}

function generateAIPlan(budget, cals) {
    customAlert("⏳ AI 正在计算", "模型正在分析营养配比，请稍候...");

    fetch(`${API_BASE_URL}/api/ai_plan`, postOptions({
        budget: budget,
        calories: cals,
        day: currentDay 
    }))
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            previewCart = {};
            previewDraftDay = currentDay;
            data.recommended_ids.forEach(id => {
                let it = currentMenuData.find(m => m.id === id);
                if (it) {
                    if (previewCart[id]) previewCart[id].quantity++;
                    else previewCart[id] = { ...it, quantity: 1 };
                }
            });
            updatePreviewCart();
            goHome();
            customAlert("✅ 测算成功", "AI 模型已为您生成推荐方案，见规划草稿箱！");
        }
    })
    .catch(err => customAlert("❌ 模型调用失败", "请检查后端 AI 接口是否开启。"));
}

// ================= 6. 用户与订单系统 (略, 保持之前版本即可) =================
// 包括 login(), logout(), checkout(), generateReceipt(), showProfile(), showHistory() 等
// 注意：其中的所有 fetch 调用都必须带上 fetchOptions 或使用 postOptions 封装。

// 通用模态框辅助
function customAlert(title, message) {
    const overlay = document.getElementById('customModalOverlay');
    document.getElementById('customModalTitle').innerText = title;
    document.getElementById('customModalMessage').innerText = message;
    document.getElementById('customModalInput').style.display = 'none';
    document.getElementById('customModalCancelBtn').style.display = 'none';
    document.getElementById('customModalConfirmBtn').onclick = () => overlay.style.display = 'none';
    overlay.style.display = 'flex';
}