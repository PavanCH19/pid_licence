# PIDS Licensing APIs

A modern, secure licensing management system built with Node.js, Express, and AWS services.

## 🚀 Features

- **Secure Authentication**: JWT-based authentication using AWS Secrets Manager
- **License Management**: Complete CRUD operations for software licenses
- **PDF Generation**: Automatic license PDF generation with credentials
- **Email Integration**: Automated email delivery with PDF attachments
- **File Management**: Secure file upload to AWS S3
- **Role-Based Access**: Admin and user role management

## 🏗️ Architecture

### **Authentication System**
- **AWS Secrets Manager**: Stores encrypted user credentials
- **JWT Tokens**: Secure, stateless authentication
- **bcrypt**: Password hashing and verification
- **Role-Based Access Control**: Admin and user permissions

### **AWS Services Integration**
- **DynamoDB**: License data storage
- **S3**: File storage and management
- **SES**: Email delivery
- **Secrets Manager**: User credential storage

## 📁 Project Structure

```
src/
├── Controllers/
│   ├── userController.js      # User authentication & management
│   ├── licenseController.js   # License business logic
│   ├── fileController.js      # File upload operations
│   ├── pdfController.js       # PDF generation
│   └── emailController.js     # Email operations
├── Routes/
│   ├── auth.js               # Authentication routes
│   ├── customers.js          # License management routes
│   └── admin.js              # Admin-only routes
├── middleware/
│   └── auth.js               # JWT authentication middleware
├── Connectors/
│   ├── AwsDynamoDBConnector.js
│   ├── AwsS3Connector.js
│   └── AwsSesConnector.js
└── app.js                     # Main application file
```

## 🔐 Authentication Flow

### **1. User Registration (Admin Only)**
```bash
POST /api/admin/createUser
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "username": "newuser",
  "password": "securepassword",
  "email": "user@example.com",
  "phone": "+1234567890",
  "role": "user"
}
```

### **2. User Login**
```bash
POST /api/signin
Content-Type: application/json

{
  "username": "username",
  "password": "password"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Login successful.",
  "code": 200,
  "data": {
    "token": "jwt-token-here",
    "user": {
      "username": "username",
      "role": "user",
      "email": "user@example.com",
      "phone": "+1234567890"
    }
  }
}
```

### **3. Password Reset**
```bash
# Step 1: Request verification code
POST /api/send-code
Content-Type: application/json

{
  "username": "username"
}

# Step 2: Reset password with code
POST /api/reset-password
Content-Type: application/json

{
  "otp": "123456",
  "newPassword": "newpassword"
}
```

### **4. Change Password (Authenticated)**
```bash
PUT /api/changePassword
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword"
}
```

## 📋 API Endpoints

### **Public Routes** (No Authentication Required)
- `POST /api/signin` - User login
- `POST /api/send-code` - Send verification code
- `POST /api/reset-password` - Reset password
- `POST /api/renewToken` - Renew JWT token
- `PUT /api/activateLicense` - Activate license

### **Customer Routes** (Basic Access)
- `POST /api/uploadFile` - Upload license files
- `POST /api/createLicence` - Create new license
- `PUT /api/updateLicence` - Update existing license
- `DELETE /api/deleteLicence` - Delete license
- `GET /api/getLicenceInfo` - Get license statistics
- `GET /api/getAllLicenses` - Retrieve all licenses
- `POST /api/generateToken` - Generate license token

### **Admin Routes** (Admin Role Required)
- `POST /api/admin/createUser` - Create new user

## 🛠️ Setup & Installation

### **1. Prerequisites**
- Node.js 16+ 
- AWS Account with appropriate permissions
- AWS CLI configured

### **2. Install Dependencies**
```bash
npm install
```

### **3. Environment Variables**
Create a `.env` file in the root directory:

```env
# AWS Configuration
REGION=us-east-1
ACCESSKEY_ID=your-access-key
SECRET_ACCESS_KEY=your-secret-key

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key

# Server Configuration
PORT=4000
```

### **4. AWS Services Setup**

#### **DynamoDB Table: `PIDS_Customers`**
- **Partition Key**: `Customer_Names` (String)
- **Sort Key**: `System_ID` (String)
- **GSI**: `System_ID-index` on `System_ID`

#### **S3 Bucket**
- Configure for file uploads
- Set appropriate CORS policies

#### **Secrets Manager**
- Secret name: `pids-user-credentials`
- Automatically created on first run with default admin user

#### **SES Configuration**
- Verify sender email domain
- Configure SMTP settings

### **5. Run the Application**
```bash
# Development
npm run dev

# Production
npm start
```

## 🔒 Security Features

### **Password Security**
- bcrypt hashing with salt rounds
- Secure password validation
- Password complexity requirements (configurable)

### **JWT Security**
- Configurable expiration times
- Secure token storage
- Role-based access control

### **AWS Security**
- IAM roles and policies
- Encrypted secrets storage
- VPC configuration support

## 📧 Email Templates

The system includes professional HTML email templates for:
- License creation notifications
- Password reset instructions
- License activation confirmations

## 📄 PDF Generation

Automatic PDF generation includes:
- Company branding
- License credentials
- Security warnings
- Professional formatting

## 🚀 Deployment

### **Local Development**
```bash
npm run dev
```

### **Serverless Deployment**
```bash
serverless deploy
```

### **Docker Deployment**
```bash
docker build -t pids-licensing .
docker run -p 4000:4000 pids-licensing
```

## 🧪 Testing

### **API Testing**
Use tools like Postman or curl to test endpoints:

```bash
# Test login
curl -X POST http://localhost:4000/api/signin \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Test protected route
curl -X PUT http://localhost:4000/api/changePassword \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"old","newPassword":"new"}'
```

## 🔧 Configuration

### **JWT Settings**
- Token expiration: 24 hours (configurable)
- Refresh token support
- Role-based claims

### **Password Policy**
- Minimum length: 8 characters
- Complexity requirements
- History tracking

### **Rate Limiting**
- API rate limiting (configurable)
- Brute force protection
- IP-based restrictions

## 📊 Monitoring & Logging

- Comprehensive error logging
- API request tracking
- Performance metrics
- Security event logging

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation

## 🔄 Migration from Cognito

This system replaces AWS Cognito with AWS Secrets Manager:

### **Benefits:**
- **Simplified Setup**: No complex Cognito configuration
- **Direct Control**: Full control over user management
- **Cost Effective**: Reduced AWS service costs
- **Flexibility**: Custom authentication logic
- **Integration**: Easier integration with existing systems

### **Migration Steps:**
1. Update environment variables
2. Install new dependencies
3. Configure AWS Secrets Manager
4. Test authentication flow
5. Update client applications
