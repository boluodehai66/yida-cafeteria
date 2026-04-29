from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
import json
import os

app = Flask(__name__)
# 允许前端跨域请求
CORS(app)

# ==================== 数据库配置 ====================
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'cafeteria.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)


# ==================== 🚀 数据库表结构模型 ====================

class User(db.Model):
    __tablename__ = 'users'
    student_id = db.Column(db.String(20), primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    password = db.Column(db.String(50), nullable=False)

    gender = db.Column(db.String(10), default="")
    age = db.Column(db.Integer, default=0)
    height = db.Column(db.Float, default=0.0)
    weight = db.Column(db.Float, default=0.0)
    body_fat = db.Column(db.Float, default=0.0)

    orders = db.relationship('Order', backref='user', lazy=True)


class Order(db.Model):
    __tablename__ = 'orders'
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.String(50), unique=True, nullable=False)
    student_id = db.Column(db.String(20), db.ForeignKey('users.student_id'), nullable=False)
    date = db.Column(db.String(20), nullable=False)
    time = db.Column(db.String(20), nullable=False)
    total_price = db.Column(db.Float, nullable=False)
    total_calories = db.Column(db.Integer, nullable=False)
    items_json = db.Column(db.Text, nullable=False)


class MenuItem(db.Model):
    __tablename__ = 'menu_items'
    id = db.Column(db.Integer, primary_key=True)
    week = db.Column(db.Integer, default=1)  # 周次
    day = db.Column(db.String(20), nullable=False)  # 星期几
    name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(50))  # 智能推断的分类
    price = db.Column(db.Float, default=15.0)  # 默认价格
    calories = db.Column(db.Integer, default=0)
    carbs = db.Column(db.Float, default=0.0)
    protein = db.Column(db.Float, default=0.0)
    fat = db.Column(db.Float, default=0.0)
    image = db.Column(db.String(255))


with app.app_context():
    db.create_all()


# ==================== 🛠️ API 接口 ====================

@app.route('/api/menu', methods=['GET'])
def get_menu():
    """从数据库获取菜单"""
    day = request.args.get('day', '周一')
    week = request.args.get('week', 1, type=int)

    items = MenuItem.query.filter_by(day=day, week=week).all()

    menu_list = [{
        "id": item.id,
        "name": item.name,
        "price": item.price,
        "category": item.category,
        "calories": item.calories,
        "carbs": item.carbs,
        "protein": item.protein,
        "fat": item.fat,
        "image": item.image
    } for item in items]

    return jsonify(menu_list)


@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    student_id = data.get('studentId')
    name = data.get('name')
    password = data.get('password')

    user = User.query.get(student_id)

    if not user:
        if password != "123456":
            return jsonify({"status": "error", "message": "注册失败：新生初始密码必须为 123456"})

        new_user = User(student_id=student_id, name=name, password=password)
        db.session.add(new_user)
        db.session.commit()
        user = new_user
    else:
        if user.password != password:
            return jsonify({"status": "error", "message": "密码错误，请重试！"})

    return jsonify({
        "status": "success",
        "message": f"欢迎回来，{user.name}！",
        "user": {
            "name": user.name, "studentId": user.student_id,
            "gender": user.gender, "age": user.age,
            "height": user.height, "weight": user.weight, "bodyFat": user.body_fat
        }
    })


@app.route('/api/update_profile', methods=['POST'])
def update_profile():
    data = request.json
    user = User.query.get(data.get('studentId'))
    if user:
        user.gender = data.get('gender')
        user.age = int(data.get('age') or 0)
        user.height = float(data.get('height') or 0)
        user.weight = float(data.get('weight') or 0)
        user.body_fat = float(data.get('bodyFat') or 0)
        db.session.commit()
        return jsonify({"status": "success", "message": "资料已同步至云端！"})
    return jsonify({"status": "error", "message": "用户不存在"})


@app.route('/api/change_password', methods=['POST'])
def change_password():
    data = request.json
    user = User.query.get(data.get('studentId'))
    if user and user.password == data.get('oldPassword'):
        user.password = data.get('newPassword')
        db.session.commit()
        return jsonify({"status": "success", "message": "密码修改成功，请牢记新密码！"})
    return jsonify({"status": "error", "message": "原密码校验失败"})


@app.route('/api/order', methods=['POST'])
def receive_order():
    order_data = request.json
    user = User.query.get(order_data.get('student_id'))
    if user:
        new_order = Order(
            order_id=order_data.get('order_id'), student_id=user.student_id,
            date=order_data.get('date'), time=order_data.get('time'),
            total_price=order_data.get('total_price'), total_calories=order_data.get('total_calories'),
            items_json=json.dumps(order_data.get('items'))
        )
        db.session.add(new_order)
        db.session.commit()
        return jsonify({"status": "success", "message": "订单已存入数据库"})
    return jsonify({"status": "error", "message": "用户不存在"})


@app.route('/api/history', methods=['GET'])
def get_history():
    student_id = request.args.get('student_id')
    orders = Order.query.filter_by(student_id=student_id).order_by(Order.id.desc()).all()
    orders_list = [{"order_id": o.order_id, "date": o.date, "time": o.time, "total_price": o.total_price,
                    "total_calories": o.total_calories, "items": json.loads(o.items_json)} for o in orders]
    return jsonify({"status": "success", "orders": orders_list})


if __name__ == '__main__':
    app.run(debug=True)