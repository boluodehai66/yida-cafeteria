import os
import traceback
import requests
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from openai import OpenAI

# =================================================================
# 🌟 1. 配置所有 API 客户端
# =================================================================
# 1. DeepSeek (用于配餐规划)
DEEPSEEK_API_KEY = "sk-8ee72b53c5034c2ab7d0bea74072c597"
deepseek_client = OpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url="https://api.deepseek.com"
)

# 2. 智谱 AI (用于单张图生成补漏)
ZHIPU_API_KEY = "579e9802d2304881a96ed288488c809b.uq6edTegmxXzpVtm"
image_client = OpenAI(
    api_key=ZHIPU_API_KEY,
    base_url="https://open.bigmodel.cn/api/paas/v4/"
)

# 3. 硅基流动 (用于分析菜品分类)
api_client = OpenAI(
    api_key="sk-cfxtslelijzmkfsdvnoqggdhmexmczpltavhbszqhmbivffr",
    base_url="https://api.siliconflow.cn/v1"
)


def init_ai_model():
    print("🚀 已成功接入云端满血大脑！显存已彻底解放！")


app = Flask(__name__)
CORS(app)

user_memory = {"campus": None, "floor": None}

# ================= 1. 数据库配置 =================
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'cafeteria.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)


# =====================================================================
# 🌟 2. 数据库模型 (修复了字段丢失，新增历史订单表)
# =====================================================================
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.String(50), unique=True, nullable=False)  # 补全学号
    name = db.Column(db.String(80), nullable=False)  # 修正为 name
    password = db.Column(db.String(120), nullable=False)
    balance = db.Column(db.Float, default=100.0)  # 补全余额
    bmr = db.Column(db.Integer, default=1800)
    goal = db.Column(db.String(100), default="保持健康")


class MenuItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    price = db.Column(db.Float, nullable=False)
    calories = db.Column(db.Integer)
    carbs = db.Column(db.Float)
    protein = db.Column(db.Float)
    fat = db.Column(db.Float)
    category = db.Column(db.String(50))
    image = db.Column(db.String(200))
    day = db.Column(db.String(20), nullable=False)
    campus = db.Column(db.String(50))
    floor = db.Column(db.String(50))


# 🌟 新增：历史订单表
class OrderHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.String(50), nullable=False)
    combo_name = db.Column(db.String(100))
    items_desc = db.Column(db.Text, nullable=False)  # 保存菜品字符串
    total_price = db.Column(db.Float, nullable=False)
    date = db.Column(db.String(50), nullable=False)


# =====================================================================
# 🌟 3. 基础功能接口
# =====================================================================
@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.get_json(silent=True)
        student_id = data.get('studentId')
        password = data.get('password')
        name = data.get('name', '小钰同学')

        if not student_id or not password:
            return jsonify({'status': 'error', 'message': '学号或密码不能为空！'}), 200

        user = User.query.filter_by(student_id=student_id).first()
        if not user:
            new_user = User(student_id=student_id, name=name, password=password)
            db.session.add(new_user)
            db.session.commit()
            return jsonify({'status': 'success', 'message': f'🎉 欢迎新同学 {name}！已自动注册。',
                            'user': {'id': new_user.id, 'name': new_user.name, 'balance': new_user.balance}})

        if user.password == password:
            return jsonify({'status': 'success', 'message': f'欢迎回来，{user.name}！',
                            'user': {'id': user.id, 'name': user.name, 'balance': user.balance}})

        return jsonify({'status': 'error', 'message': '密码错误，请检查输入！'}), 200
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'后端报错: {str(e)}'}), 200


@app.route('/api/update_profile', methods=['POST'])
def update_profile():
    try:
        data = request.json
        student_id = data.get('studentId')
        if not student_id:
            return jsonify({'status': 'error', 'message': '未提供学号，无法更新'}), 200

        user = User.query.filter_by(student_id=student_id).first()
        if not user:
            return jsonify({'status': 'error', 'message': '在数据库中找不到该用户'}), 200

        if 'name' in data and data['name']: user.name = data['name']
        if 'password' in data and data['password']: user.password = data['password']

        db.session.commit()
        return jsonify({'status': 'success', 'message': '档案保存成功！',
                        'user': {'id': user.id, 'name': user.name, 'balance': user.balance}})
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'后端报错: {str(e)}'}), 200


@app.route('/api/analyze_dish', methods=['POST'])
def analyze_dish():
    dish_name = request.json.get('name')
    if not dish_name: return jsonify({"error": "请输入菜名"}), 400
    try:
        response = api_client.chat.completions.create(
            model="Qwen/Qwen2.5-7B-Instruct",
            messages=[
                {"role": "system", "content": "你必须且只能从[主食, 荤菜, 素菜, 小吃, 汤羹]中返回一个分类，不要多说话。"},
                {"role": "user", "content": f"菜名：{dish_name}"}],
            temperature=0.1
        )
        cat = response.choices[0].message.content.strip()
        return jsonify({"category": cat if cat in ["主食", "荤菜", "素菜", "小吃", "汤羹"] else "其他"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/menu', methods=['GET'])
def get_menu():
    day = request.args.get('day', '周一')
    campus = request.args.get('campus', '北区')
    floor = request.args.get('floor', '一楼')
    items = MenuItem.query.filter_by(day=day, campus=campus, floor=floor).all()
    menu_data = [
        {"id": i.id, "name": i.name, "price": i.price, "calories": i.calories, "carbs": i.carbs, "protein": i.protein,
         "fat": i.fat, "category": i.category, "image": i.image} for i in items]
    return jsonify(menu_data)


# 🌟 修复：改用智谱 CogView，彻底解决 403 问题
@app.route('/api/generate_image', methods=['POST'])
def generate_image():
    try:
        dish_name = request.json.get('name')
        if not dish_name: return jsonify({"status": "error", "message": "没有提供菜名"}), 400

        image_dir = os.path.join(basedir, 'static', 'images')
        os.makedirs(image_dir, exist_ok=True)
        local_filename = f"{dish_name}.jpg"
        local_filepath = os.path.join(image_dir, local_filename)
        db_image_path = f"/static/images/{local_filename}"

        if os.path.exists(local_filepath):
            return jsonify({"status": "success", "image_url": db_image_path, "message": "图片本地已存在，无需重新生成"})

        print(f"🎨 正在召唤 智谱CogView 为【{dish_name}】作画...")
        prompt = f"一张专业的美食摄影照片，中国菜【{dish_name}】，刚出锅冒着热气，色泽诱人，餐厅级打光，高清微距特写。"

        response = image_client.images.generate(model="cogview-3-plus", prompt=prompt, size="1024x1024")

        img_data = requests.get(response.data[0].url).content
        with open(local_filepath, 'wb') as handler:
            handler.write(img_data)

        item = MenuItem.query.filter_by(name=dish_name).first()
        if item:
            item.image = db_image_path
            db.session.commit()

        return jsonify({"status": "success", "image_url": db_image_path})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 200


# =====================================================================
# 🌟 4. 新增：订单记录与查询接口
# =====================================================================
# =====================================================================
# 🌟 新增：订单记录与历史查询接口
# =====================================================================
# 1. 定义历史订单数据库表



# 2. 前端结账下单的接收接口
@app.route('/api/checkout', methods=['POST'])
def save_order():
    try:
        data = request.json
        student_id = data.get('student_id')
        items = data.get('items', [])
        total_price = data.get('total_price', 0)
        date = data.get('date', '未知日期')

        if not student_id:
            return jsonify({"status": "error", "message": "请先登录才能下单！"}), 200

        user = User.query.filter_by(student_id=student_id).first()
        if user:
            # 扣除余额
            if user.balance >= total_price:
                user.balance -= total_price
            else:
                return jsonify({"status": "error", "message": "余额不足，请充值！"}), 200

            # 把点选的菜品拼成一句话存起来
            items_str = ", ".join([f"{item.get('name')} x{item.get('quantity')}" for item in items])

            new_order = OrderHistory(student_id=student_id, combo_name="自选套餐", items_desc=items_str,
                                     total_price=total_price, date=date)
            db.session.add(new_order)
            db.session.commit()

            return jsonify({"status": "success", "message": "下单成功！", "balance": user.balance})
        else:
            return jsonify({"status": "error", "message": "找不到该学生信息！"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 200


# 3. 前端查询历史订单的接口
@app.route('/api/history', methods=['GET'])
def get_history():
    student_id = request.args.get('student_id')
    if not student_id:
        return jsonify({"status": "error", "message": "未提供学号"})

    orders = OrderHistory.query.filter_by(student_id=student_id).order_by(OrderHistory.id.desc()).all()
    result = []
    for o in orders:
        result.append({
            "id": o.id,
            "combo_name": o.combo_name,
            "items_desc": o.items_desc,
            "total_price": o.total_price,
            "time": o.date  # 前端是用 time 接收的
        })
    return jsonify({"status": "success", "orders": result})

# =====================================================================
# 🌟 5. 核心配餐接口
# =====================================================================
@app.route('/api/ai_plan', methods=['POST'])
def ai_plan():
    combos = []
    try:
        data = request.json
        user_input = data.get('text', '')
        day = data.get('day', '周一')

        # 🌟 剥夺全局记忆：直接拿前端传过来的当前聊天位置
        campus = data.get('campus')
        floor = data.get('floor')

        # 如果前端没传位置（说明是新对话还没告诉AI），立刻反问！
        # 🌟 核心：获取前端传来的昵称
        nickname = data.get('nickname', '同学')

        if not campus or not floor:
            return jsonify({
                "status": "success",
                "combos": [],
                "reason": f"你好{nickname}！在为你搭配专属营养套餐前，请问你今天想在哪个校区哪层楼就餐呢？（例如：我想去北区一楼）"
            })

        menu_items = MenuItem.query.filter_by(day=day, campus=campus, floor=floor).all()
        if not menu_items: return jsonify({"status": "error", "message": f"{campus}{floor}今天没有菜单数据"})

        formatted_menu = [f"- [{i.category}] {i.name} ￥{i.price} ({i.calories}kcal)" for i in menu_items]
        menu_desc = "\n".join(formatted_menu)

        system_prompt = f"你是一个校园AI营养师。当前位置：{campus}{floor}。"
        instructions = f"""【紧急指令】你现在正在进行开卷考试。
1. 你【必须且只能】从下方的《今日真实菜单》中选择菜品。
2. 【绝对禁止】使用你记忆中的任何菜名，如果菜单里没有，绝对不能写！
3. 【强制包含主食】除非用户明确说明“不要主食”，否则你的套餐里【必须至少包含一份 [主食]】！
4. 【强制数量】为了凑够预算，你必须选择 2-4 道菜品组成套餐。
5. 【格式红线】每一道菜的前面【必须严格保留】中括号的分类标签（如 [荤菜]、[主食]），一个字都不能漏！

《今日真实菜单》：
{menu_desc}

输出格式（严格遵守）：
### 方案：[起一个有吸引力的名字]
- [分类] 菜名 ￥价格 (热量kcal)
- [分类] 菜名 ￥价格 (热量kcal)
"""
        try:
            response = deepseek_client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": system_prompt + "\n" + instructions},
                    {"role": "user", "content": user_input}
                ],
                temperature=0.2,
                stream=False
            )
            assistant_response = response.choices[0].message.content.strip()
        except Exception as api_err:
            return jsonify({"status": "error", "message": f"DeepSeek 请求失败: {str(api_err)}", "combos": []})

        current_combo_name = "🍽️ 智能推荐搭配"
        current_ids = []
        headers = ["方案", "第一餐", "建议", "推荐"]

        for line in assistant_response.split('\n'):
            line = line.strip()
            if not line: continue

            if any(h in line and len(line) < 20 for h in headers):
                if current_ids:
                    selected = [item for item in menu_items if item.id in current_ids]
                    combos.append({
                        "name": current_combo_name, "ids": current_ids,
                        "items": [{"name": i.name, "image": i.image, "price": i.price, "calories": i.calories,
                                   "protein": i.protein, "carbs": i.carbs, "fat": i.fat, "category": i.category} for i
                                  in selected],
                        "real_price": round(sum(i.price for i in selected), 2),
                        "real_calories": int(sum(i.calories for i in selected)),
                        "real_protein": round(sum(i.protein for i in selected), 1),
                        "real_carbs": round(sum(i.carbs for i in selected), 1),
                        "real_fat": round(sum(i.fat for i in selected), 1)
                    })
                    current_ids = []
                current_combo_name = line.strip("*#【】:-： ")
                continue

            if line.startswith('-'):
                for item in menu_items:
                    if item.name in line and item.id not in current_ids:
                        current_ids.append(item.id)

        if current_ids:
            selected = [item for item in menu_items if item.id in current_ids]
            combos.append({
                "name": current_combo_name, "ids": current_ids,
                "items": [
                    {"name": i.name, "image": i.image, "price": i.price, "calories": i.calories, "protein": i.protein,
                     "carbs": i.carbs, "fat": i.fat, "category": i.category} for i in selected],
                "real_price": round(sum(i.price for i in selected), 2),
                "real_calories": int(sum(i.calories for i in selected)),
                "real_protein": round(sum(i.protein for i in selected), 1),
                "real_carbs": round(sum(i.carbs for i in selected), 1),
                "real_fat": round(sum(i.fat for i in selected), 1)
            })

        final_text = assistant_response
        if combos:
            final_text += "\n\n---\n**✅ 方案营养数据汇总：**\n"
            for cb in combos:
                final_text += f"🔹 **{cb['name']}**\n💰 总价：￥{cb['real_price']} | 🔥 总热量：{cb['real_calories']} kcal\n📊 蛋白质：{cb['real_protein']}g | 碳水：{cb['real_carbs']}g | 脂肪：{cb['real_fat']}g\n\n"
            final_text += "> 💡 *详细菜品图片及单项数据已同步至右侧预览区。*"

        return jsonify({"status": "success", "combos": combos, "reason": final_text})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "message": f"计算出错: {str(e)}", "combos": []})


if __name__ == '__main__':
    # 建立上下文以确保表存在（自动创建新表结构）
    with app.app_context():
        db.create_all()
    app.run(host='0.0.0.0', port=5000, debug=False)