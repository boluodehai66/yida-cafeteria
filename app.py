import os
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from openai import OpenAI
from canteen_ai.model.canteen_service import CanteenAIService

app = Flask(__name__)
CORS(app)  # 允许前端跨域请求
canteen_ai = CanteenAIService()

# ================= 1. 数据库配置 =================
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'cafeteria.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.String(20), unique=True, nullable=False)
    name = db.Column(db.String(50), nullable=False)
    password = db.Column(db.String(100), nullable=False)
    balance = db.Column(db.Float, default=100.0)


# 完全体菜单表
class MenuItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    week = db.Column(db.Integer)
    day = db.Column(db.String(10))
    name = db.Column(db.String(100))
    category = db.Column(db.String(50))
    price = db.Column(db.Float)
    calories = db.Column(db.Integer)
    carbs = db.Column(db.Float, default=0.0)
    protein = db.Column(db.Float, default=0.0)
    fat = db.Column(db.Float, default=0.0)
    image = db.Column(db.String(255))


class Order(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    items = db.Column(db.Text)
    total_price = db.Column(db.Float)


# ================= 2. 初始化云端 API (用于前端录入新菜时快速分类) =================
api_client = OpenAI(
    api_key="sk-cfxtslelijzmkfsdvnoqggdhmexmczpltavhbszqhmbivffr",
    base_url="https://api.siliconflow.cn/v1"
)

# ================= 3. 本地 LoRA 模型服务 (用于复杂的智能配餐) =================
# 模型采用懒加载：Flask 启动时不立即加载 4B 模型，第一次请求 /api/ai_plan 时再加载。


# ================= 4. API 路由接口 =================

@app.route('/api/analyze_dish', methods=['POST'])
def analyze_dish():
    """云端能力接口：前端如果想手动添加一道新菜，可调用此接口让 AI 自动判断它是啥分类"""
    dish_name = request.json.get('name')
    if not dish_name:
        return jsonify({"error": "请输入菜名"}), 400

    try:
        response = api_client.chat.completions.create(
            model="Qwen/Qwen2.5-7B-Instruct",
            messages=[
                {"role": "system", "content": "你必须且只能从[主食, 荤菜, 素菜, 小吃, 汤羹]中返回一个分类，不要多说话。"},
                {"role": "user", "content": f"菜名：{dish_name}"}
            ],
            temperature=0.1
        )
        cat = response.choices[0].message.content.strip()
        valid_cats = ["主食", "荤菜", "素菜", "小吃", "汤羹"]
        return jsonify({"category": cat if cat in valid_cats else "其他"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/menu', methods=['GET'])
def get_menu():
    """获取指定日期的菜单"""
    day = request.args.get('day', '周一')
    items = MenuItem.query.filter_by(day=day).all()
    return jsonify([{
        'id': i.id, 'name': i.name, 'price': i.price, 'calories': i.calories,
        'category': i.category, 'carbs': i.carbs, 'protein': i.protein,
        'fat': i.fat, 'image': i.image
    } for i in items])


@app.route('/api/ai_plan', methods=['POST'])
def ai_plan():
    """本地 LoRA 模型接口：AI 智能测算配餐"""
    try:
        data = request.json
        budget = float(data.get('budget', 15))
        target_cal = float(data.get('calories', 500))
        day = data.get('day', '周一')

        menu_items = MenuItem.query.filter_by(day=day).all()
        if not menu_items:
            return jsonify({"status": "error", "message": "当天没有菜单数据"})

        ai_res = canteen_ai.recommend(menu_items, budget, target_cal, day)
        if ai_res["recommended_ids"]:
            return jsonify({
                "status": "success",
                "recommended_ids": ai_res["recommended_ids"],
                "reason": ai_res.get("reason", "营养师为您精心搭配"),
                "source": ai_res.get("source"),
                "model_status": ai_res.get("model_status"),
                "model_error": ai_res.get("model_error"),
            })

        return jsonify({"status": "error", "message": ai_res.get("reason", "AI 暂时无法生成配餐方案")})

    except Exception as e:
        print(f"❌ 测算报错: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/ai_status', methods=['GET'])
def ai_status():
    """查看本地模型接入状态，方便前端或调试时确认是否加载 LoRA。"""
    return jsonify(canteen_ai.status())


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
