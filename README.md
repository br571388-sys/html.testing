# 🚀 GitHub Workflows Kya Hote Hain? (Easy Guide)

> **Workflow file** ek chhoti si setting file hoti hai jo GitHub ko batati hai ki tumhare code ke sath **kab** aur **kya** karna hai. Yeh file hamesha tumhari repository ke andar ek specific folder me hoti hai: `.github/workflows/` aur iska extension `.yml` hota hai.

---

## 🛠️ 1. Ek Basic Workflow Kaisa Dikhta Hai?

Maan lo tumne `build.yml` naam ki ek file banayi. Usme kuch aisa code hota hai:

```yaml
name: Build
on:
  workflow_dispatch:        # 👈 Iska matlab hai "Run" button dabane par manually chalega
jobs:
  build:
    runs-on: ubuntu-latest  # 💻 Yeh GitHub ke Ubuntu server par chalega
    steps:
      - uses: actions/checkout@v4  # 📥 Tumhara code repo se wahan layega
      - run: echo "Hello Utkarsh!" # ▶️ Ek simple command run karega
```

### Is file me basically 3 main cheezein hoti hain:
1. ⏰ **Kab chale (Trigger):** Code push karne par, kisi fix time par, ya manually (`workflow_dispatch`).
2. 🌍 **Kahan chale (Runner):** GitHub ke konse system par chale (jaise `ubuntu-latest`).
3. 🤖 **Kya kare (Steps):** Tumhe kya karwana hai (jaise code lana, install karna, script run karna).

---

## 📱 2. App Me Workflow Kaise Kaam Karta Hai?

Abhi jo app tum use kar rahe ho, usme **Actions** tab me sirf wahi workflows dikhenge jo tumhari repo me *pehle se bane hue hain*. Agar repo me koi `.yml` file nahi hai, toh Actions tab ekdum khali dikhega. 

**Naya workflow kaise banayein?** 👇
* 📝 **Step 1:** Editor me **Add File** par click karo.
* 📂 **Step 2:** File ka exact naam do: `.github/workflows/build.yml` *(App yeh folder khud bana legi)*.
* 💾 **Step 3:** Usme apna YAML code likho, **Save** karo aur **Deploy All** kar do.
* ✨ **Result:** Bas! Ab woh naya workflow tumhare Actions tab me dikhne lagega.

---

## ⚠️️ 3. Sabse Zaruri Baat: Token Permissions

GitHub aise hi kisi ko bhi workflows create ya edit nahi karne deta. Jab tum `.github/workflows/` me koi file banate ho, toh tumhare GitHub Token ke paas special permission honi chahiye:

* 🔑 **Fine-grained token:** Isme **"Workflows: Read and write"** select hona chahiye.
* 🗝️ **Classic token:** Isme **"workflow"** wale dabbe par tick hona chahiye.

> **Note:** Agar yeh permissions nahi hongi, toh jab tum file save karke deploy karoge, toh GitHub usko reject kar dega aur error aayega.

---

## 📦 4. Artifacts Kya Hote Hain? trailer 

Last me **Artifacts** ka zikra tha. Ye un output files ko bolte hain jo tumhara workflow run hone ke baad banata hai. 

* **Example:** Jaise tumne koi script run karke `.zip` file banwayi, ya Android ki `.apk` file.
* **Download Kaise Karein?:** Tumhari current app in files ko direct download nahi kar sakti. Inhe download karne ke liye tumhe browser me GitHub website open karni hogi, aur apne workflow ke 'Run' page se inhe manually download karna padega. 