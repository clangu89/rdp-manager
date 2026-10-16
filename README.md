# 🌐 Remote Desktop Manager (Web Application)

ระบบเว็บแอปพลิเคชันสำหรับจัดเก็บและบริหารจัดการข้อมูลการเชื่อมต่อ Remote Desktop (RDP) รายไซต์งาน พร้อมระบบจัดการสิทธิ์ผู้ใช้งาน (Permission Matrix) และปุ่มกด **"Remote"** สั่งเชื่อมต่อไปยังโปรแกรม **Windows Remote Desktop Connection (`mstsc.exe`)** อัตโนมัติ (Zero-Prompt Auto-Logon)

- **Backend & Database**: Google Sheets + Google Apps Script (Web App API)
- **Frontend**: HTML5, Tailwind CSS, JavaScript (Single Page Application)
- **Deployment**: GitHub Pages (`clangu89/rdp-manager`)

---

## 🚀 ฟีเจอร์หลัก (Key Features)

1. **จัดการข้อมูลไซต์งาน (CRUD Sites)**:
   - บันทึก IP Address, Port (ค่าเริ่มต้น 3389), Username, Password, ชื่อไซต์งาน และหมวดหมู่
   - ค้นหาแบบ Real-time และกรองตามหมวดหมู่ไซต์งานได้ทันที
   - รองรับมุมมองทั้งแบบ **Card Grid** และ **Table View**

2. **เชื่อมต่อ Windows Remote Desktop 1-Click (Zero-Prompt)**:
   - กดปุ่ม **"Remote"** ระบบจะสั่งเปิดโปรแกรม Remote Desktop ของ Windows (`mstsc.exe`) พร้อมใส่ Username/Password และล็อกอินให้ทันที 100%
   - มีระบบความปลอดภัย **ซ่อนรหัสผ่านจากผู้ใช้ทั่วไป (Hide Password)**: ผู้ใช้สามารถกด Remote ได้อย่างเดียวโดยไม่เห็นรหัสผ่านบนหน้าจอ

3. **ระบบผู้ใช้งานและกำหนดสิทธิ์ (User & Permission Management)**:
   - บัญชี **Admin**: สามารถเพิ่ม/ลบ/แก้ไข ไซต์งาน และกำหนดสิทธิ์ให้ผู้ใช้รายคน
   - บัญชี **User ทั่วไป**: มองเห็นเฉพาะไซต์งานที่ตนเองได้รับสิทธิ์เท่านั้น
   - กำหนดสิทธิ์แบบ **เห็นทุกไซต์งาน (All Sites)** หรือ **เลือกเฉพาะบางไซต์งาน**

4. **โหมดสาธิตในตัว (Built-in Demo Mode)**:
   - หากยังไม่ได้ผูก Google Apps Script ระบบสามารถทดลองใช้งานผ่าน Mock Data ได้ทันที (เช่น `admin` / `admin1234` หรือ `staff` / `staff1234`)

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

```text
Remote Manager/
├── backend/
│   ├── Code.gs                   # Web App API Controller (Login, Sites, Users, Permissions, AuditLog)
│   ├── InitialSetup.gs           # สคริปต์สร้างตาราง, คอลัมน์, Admin เริ่มต้น และไซต์ตัวอย่าง
│   └── appsscript.json           # Manifest Configuration ของ Google Apps Script
├── helper/
│   ├── install-rdp-protocol.bat  # ตัวติดตั้ง 1-Click Zero-Prompt Protocol (rdpconnect://) บน Windows
│   └── uninstall-rdp-protocol.bat# ตัวถอนการติดตั้ง Protocol
├── css/
│   └── style.css                 # สไตล์ตกแต่งเพิ่มเติม, Font Prompt, Toast Notifications, Modals
├── js/
│   ├── config.js                 # กำหนดค่า URL ของ Google Apps Script Web App
│   ├── api.js                    # ตัวเรียก API จัดการ CORS และ Demo Mode
│   ├── auth.js                   # จัดการ Session Token และสิทธิ์ผู้ใช้งาน
│   ├── rdp-launcher.js           # ตัวสร้างการเชื่อมต่อ RDP (Protocol & .rdp file generator)
│   └── app.js                    # ตรรกะควบคุมหน้าเว็บ, ตาราง, ฟิลเตอร์, และ Modals
├── .github/
│   └── workflows/
│       └── deploy.yml            # GitHub Actions CI/CD สำหรับ Deploy บน GitHub Pages อัตโนมัติ
├── index.html                    # หน้าเว็บหลัก Single Page Application
├── .nojekyll                     # ป้องกัน GitHub Pages ประมวลผล Jekyll
└── README.md                     # คู่มือการติดตั้งและใช้งานระบบ
```

---

## 🛠️ ขั้นตอนการติดตั้งและใช้งาน (Step-by-Step Setup)

### ขั้นตอนที่ 1: ติดตั้ง Backend บน Google Sheets & Google Apps Script
1. ไปที่ [Google Sheets](https://sheets.new) เพื่อสร้างสเปรดชีตเปล่าขึ้นมา 1 ไฟล์ (ตั้งชื่อไฟล์ เช่น `RDP-Manager-Database`)
2. ไปที่เมนู **ส่วนขยาย (Extensions)** > **Apps Script**
3. ลบโค้ดเดิมใน `Code.gs` แล้วนำโค้ดจากไฟล์ [`backend/Code.gs`](file:///d:/GoogleDrive/0.WorkSpace/Application/Remote%20Manager/backend/Code.gs) ในโปรเจกต์นี้ไปวาง
4. กดเครื่องหมาย `+` ด้านซ้าย เลือก **Script** ตั้งชื่อว่า `InitialSetup.gs` แล้วนำโค้ดจากไฟล์ [`backend/InitialSetup.gs`](file:///d:/GoogleDrive/0.WorkSpace/Application/Remote%20Manager/backend/InitialSetup.gs) ไปวาง
5. บนแถบเมนูด้านบน เลือกฟังก์ชัน **`runInitialSetup`** แล้วกดปุ่ม **Run (เรียกใช้)**
   - กดยอมรับสิทธิ์การเข้าถึง (Review Permissions > Advanced > Go to Untitled project (unsafe) > Allow)
   - เมื่อรันเสร็จ ใน Google Sheets จะมีแถบ `Users`, `Sites`, `Permissions`, `AuditLogs` พร้อมข้อมูลเริ่มต้น
6. กดปุ่ม **ทำให้ใช้งานได้ (Deploy)** ที่มุมขวาบน > เลือก **การทำให้ใช้งานได้รายการใหม่ (New deployment)**
   - เลือกประเภท (Select type): **เว็บแอป (Web app)**
   - คำอธิบาย (Description): `v1`
   - ปฏิบัติการในฐานะ (Execute as): **ฉัน (Me / your email)**
   - ผู้ที่มีสิทธิ์เข้าถึง (Who has access): **ทุกคน (Anyone)** *(สำคัญมาก! เพื่อให้หน้าเว็บบน GitHub Pages เรียกใช้งานได้)*
7. กด **ทำให้ใช้งานได้ (Deploy)** แล้วคัดลอก **URL เว็บแอป (Web app URL)** ที่ลงท้ายด้วย `/exec` เก็บไว้

---

### ขั้นตอนที่ 2: ตั้งค่า Frontend เชื่อมต่อกับ Backend
ท่านสามารถทำได้ 2 วิธี:
- **วิธีที่ 1 (ผ่านไฟล์โค้ด)**: เปิดไฟล์ `js/config.js` นำ URL ที่ได้จากขั้นตอนที่ 1 มาวางในตัวแปร `DEFAULT_GAS_API_URL`:
  ```javascript
  DEFAULT_GAS_API_URL: "https://script.google.com/macros/s/AKfycbx.../exec",
  ```
- **วิธีที่ 2 (ผ่านหน้าเว็บ)**: เมื่อเปิดหน้าเว็บ สามารถคลิกไอคอนฟันเฟือง ⚙️ (Settings) แล้ววาง URL เว็บแอป และกดบันทึกได้ทันที

---

### ขั้นตอนที่ 3: ติดตั้งระบบเชื่อมต่อ 1-Click บนเครื่อง Windows (ทำเพียงครั้งเดียว)
เพื่อให้การกดปุ่ม "Remote" เปิดโปรแกรม Windows Remote Desktop (`mstsc.exe`) และล็อกอินให้อัตโนมัติ:
1. เข้าไปที่โฟลเดอร์ `helper/` แล้วดับเบิลคลิกไฟล์ **`install-rdp-protocol.bat`** (หรือกดปุ่มดาวน์โหลดตัวติดตั้งจากหน้าต่างบนหน้าเว็บได้โดยตรง)
2. เมื่อหน้าต่างแสดงข้อความ `[SUCCESS] ติดตั้งสำเร็จเรียบร้อย!` ให้กดปุ่มใดๆ เพื่อปิด
3. ทดสอบโดยการกดปุ่ม **"Remote"** บนหน้าเว็บ Windows จะเปิดการเชื่อมต่อเข้าสู่เซิร์ฟเวอร์ปลายทางทันทีโดยไม่ต้องกรอกรหัสผ่านซ้ำ

---

### ขั้นตอนที่ 4: การนำขึ้น GitHub และเปิดใช้งาน GitHub Pages (`clangu89`)
1. สร้าง Repository ใหม่บน GitHub ในบัญชี `clangu89` ชื่อ **`rdp-manager`**:
   - URL: `https://github.com/clangu89/rdp-manager`
2. เปิด Command Prompt / Terminal ในโฟลเดอร์นี้ แล้วรันคำสั่ง:
   ```bash
   git init
   git add .
   git commit -m "feat: initial commit for rdp-manager web application"
   git branch -M main
   git remote add origin https://github.com/clangu89/rdp-manager.git
   git push -u origin main
   ```
3. ไปที่ GitHub Repository > **Settings** > **Pages**
   - ในส่วน **Build and deployment**:
     - Source: เลือก **GitHub Actions** (จะ Deploy อัตโนมัติผ่าน `.github/workflows/deploy.yml`) หรือเลือก Deploy from a branch: `main` / `/(root)`
4. เมื่อ Deploy เสร็จสิ้น สามารถเข้าใช้งานหน้าเว็บได้ที่:
   ```text
   https://clangu89.github.io/rdp-manager/
   ```

---

## 🔑 ข้อมูลบัญชีผู้ใช้เริ่มต้น (Default Credentials)

| บทบาท (Role) | Username | Password | สิทธิ์การเข้าถึง |
|---|---|---|---|
| **Administrator** | `admin` | `admin1234` | มองเห็นทุกไซต์งาน, เพิ่ม/ลบไซต์, จัดการผู้ใช้และสิทธิ์ |
| **Staff (ทั่วไป)** | `staff` | `staff1234` | มองเห็นเฉพาะไซต์ที่กำหนด (เริ่มต้นคือ สาขาเชียงใหม่) |

> 💡 *ข้อแนะนำ: เมื่อเริ่มใช้งานจริง แนะนำให้เข้าสู่ระบบด้วยบัญชี `admin` แล้วเข้าไปที่เมนู "จัดการผู้ใช้ & สิทธิ์" เพื่อเปลี่ยนรหัสผ่านทันที*
