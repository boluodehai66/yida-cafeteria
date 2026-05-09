import os
import torch
import json
import re
import traceback
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from transformers import AutoTokenizer, AutoModelForCausalLM
from openai import OpenAI

app = Flask(__name__)
CORS(app)

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


# 🌟 全局强制建表
with app.app_context():
    db.create_all()

# ================= 2. 初始化 AI =================
api_client = OpenAI(
    api_key="sk-cfxtslelijzmkfsdvnoqggdhmexmczpltavhbszqhmbivffr",
    base_url="https://api.siliconflow.cn/v1"
)

print("🔄 正在加载本地核心 AI 模型与 LoRA 微调...")
base_model_path = r"D:\pycharm\pycharm project\yida_web\canteen_ai\model\Qwen1.5-4B-Chat"
lora_path = r"D:\pycharm\pycharm project\yida_web\canteen_ai\model\canteen_lora"

try:
    from transformers import BitsAndBytesConfig

    # 🌟 开启 4-bit 量化引擎 (极速压缩技术)
    quantization_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4"
    )

    tokenizer = AutoTokenizer.from_pretrained(base_model_path, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        base_model_path,
        device_map="auto",
        quantization_config=quantization_config,  # 👈 挂载量化引擎
        torch_dtype=torch.float16,
        trust_remote_code=True
    )
    try:
        from peft import PeftModel

        if os.path.exists(lora_path):
            model = PeftModel.from_pretrained(model, lora_path)
            print("✅ 成功融合同学训练的 LoRA 专属食堂权重！")
    except Exception as le:
        print(f"⚠️ LoRA 挂载异常，降级为基础模型: {le}")

    model.eval()
    print("✅ AI 大脑已就位，随时准备配餐！")
except Exception as e:
    print(f"❌ 模型加载失败: {e}")
    model = None
    tokenizer = None


# ================= 3. API 路由 =================
@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({'status': 'error', 'message': '未收到数据'}), 200

        student_id = data.get('studentId')
        password = data.get('password')
        name = data.get('name', '小钰同学')

        if not student_id or not password:
            return jsonify({'status': 'error', 'message': '学号或密码不能为空！'}), 200

        user = User.query.filter_by(student_id=student_id).first()

        if not user:
            # 自动注册
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
    items = MenuItem.query.filter_by(day=day).all()
    return jsonify([{'id': i.id, 'name': i.name, 'price': i.price, 'calories': i.calories, 'category': i.category,
                     'carbs': i.carbs, 'protein': i.protein, 'fat': i.fat, 'image': i.image} for i in items])


@app.route('/api/ai_plan', methods=['POST'])
def ai_plan():
    try:
        data = request.json
        user_input = data.get('text', '')  # 🌟 直接接收用户的原始对话文本
        day = data.get('day', '周一')

        menu_items = MenuItem.query.filter_by(day=day).all()
        if not menu_items:
            return jsonify({"status": "error", "message": "当天没有菜单数据"})

        # ==================== 🌟 1:1 完美复刻 infer.py ====================
        menu_desc = "\n".join([f"- {i.name} ￥{i.price} {i.calories}kcal" for i in menu_items])

        system_prompt = f"你是食堂点餐助手。回答用户关于食堂的问题。\n\n当前可用菜单（{day}）：\n{menu_desc[:1500]}\n\n食堂信息：综合楼一楼，早餐7-9点，午餐11:30-13:30，晚餐17-19点"

        full_prompt = f"<|im_start|>system\n{system_prompt}<|im_end|>\n<|im_start|>user\n{user_input}<|im_end|>\n<|im_start|>assistant\n"

        if 'model' not in globals() or model is None or tokenizer is None:
            return jsonify({"status": "error", "message": "AI 模型未加载，请检查后端报错。"})

        inputs = tokenizer([full_prompt], return_tensors="pt").to(model.device)
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=512,
                temperature=0.5,  # 恢复同学设定的 0.5 灵魂温度
                top_p=0.8,
                do_sample=True,
                pad_token_id=tokenizer.eos_token_id,
            )

        response = tokenizer.decode(outputs[0], skip_special_tokens=True)
        if "assistant\n" in response:
            assistant_response = response.split("assistant\n")[-1].strip()
        else:
            assistant_response = response.strip()

        print(f"\n🤖 AI 自由发挥的回复:\n{assistant_response}\n")
        # ===================================================================

        # 🌟 魔法提取术：从 AI 的长篇大论中，精准揪出它推荐的菜品 ID
        recommended_ids = []
        for item in menu_items:
            if item.name in assistant_response:
                recommended_ids.append(item.id)

        return jsonify({
            "status": "success",
            "recommended_ids": list(set(recommended_ids)),
            "reason": assistant_response
        })

    except Exception as e:
        print(f"🔥 崩溃:\n{traceback.format_exc()}")
        return jsonify({"status": "error", "message": str(e)}), 200


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)