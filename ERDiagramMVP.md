```mermaid
erDiagram
    %% ==========================================
    %% Centralized User Management
    %% ==========================================
    Users {
        int user_id PK "MVP - Central User ID"
        string source_company_id "MVP - Source Company ID"
        string username "MVP - Username"
        string company_name "MVP - Company Name"
        string email "MVP - Email Address"
        string password "MVP - Password"
        string phone "MVP - Phone Number"
        string address "MVP - Company Address"
        string account_type "MVP - Contractor/Supplier/Rental/Admin"
    }

    %% ==========================================
    %% Role-Specific Entities
    %% ==========================================
    Contractors {
        int contractor_id PK "MVP - Contractor ID"
        int user_id FK "Links to Users"
        string role "MVP - Role (Procurement/SiteEngineer)"
    }

    Suppliers {
        int supplier_id PK "MVP - Supplier ID"
        int user_id FK "Links to Users"
        string iso_certification "MVP - ISO Certificate Info"
        string verification_status "MVP - Pending/Approved/Rejected"
    }

    EquipmentRentals {
        int rental_partner_id PK "MVP - Rental Partner ID"
        int user_id FK "Links to Users"
    }

    %% ==========================================
    %% Catalogs & Inventory
    %% ==========================================
    MaterialList {
        int material_id PK "MVP - Material ID"
        string source_material_id "MVP - Source Material ID"
        string material_name "MVP - Material Name"
        string unit "MVP - Unit of Measure"
        float avg_price "MVP - Average Market Price"
    }

    SupplierMaterials {
        int supplier_id PK, FK "MVP - Offered By Supplier"
        int material_id PK, FK "MVP - Links to Material"
        float listed_price "MVP - Supplier Price"
    }

    EquipmentList {
        int equip_id PK "MVP - Equipment ID"
        int rental_partner_id FK "MVP - Listed By Rental Partner"
        string equip_name "MVP - Equipment Name"
        float equip_price "MVP - Equipment Price"
    }

    %% ==========================================
    %% Transactions & Orders
    %% ==========================================
    PurchaseOrders {
        int order_id PK "MVP - Unique Order ID"
        string source_transaction_id "MVP - Source Transaction ID"
        int contractor_id FK "MVP - Placed By"
        int proj_id FK "MVP - For Project"
        date order_date "MVP - Date Placed"
        string order_status "MVP - Pending/Processed/Delivered"
        float total_value "MVP - Order Value for Commission"
    }

    %% Bridge Tables for Order Line Items
    OrderMaterials {
        int order_id PK, FK "MVP - Links to Order"
        int material_id PK, FK "MVP - Links to Material"
        int quantity "MVP - Amount Ordered"
        float unit_price "MVP - Price Per Unit"
        float discount_rate "MVP - Discount Percentage"
    }

    OrderEquipment {
        int order_id PK, FK "MVP - Links to Order"
        int equip_id PK, FK "MVP - Links to Equipment"
        int rental_days "MVP - Duration"
    }

    %% ==========================================
    %% Project Management
    %% ==========================================
    Projects {
        int proj_id PK "MVP - Project ID"
        int contractor_id FK "MVP - Managed By"
        string proj_name "MVP - Project Name"
        string proj_address "MVP - Project Address"
        string proj_phase "MVP - Project Phase"
    }

    ProjectDocumentation {
        int doc_id PK "MVP - Unique Document ID"
        int proj_id FK "MVP - Links to Project"
        string doc_type "MVP - OCR Receipt / QA Checklist"
        string doc_url "MVP - Cloud Storage Link"
    }


    %% ==========================================
    %% Notifications
    %% ==========================================
    Notifications {
        int notification_id PK "MVP - Notification ID"
        int user_id FK "MVP - Recipient"
        int order_id FK "MVP - Related Order"
        string message "MVP - Notification Content"
        boolean is_read "MVP - Read Status"
        date created_at "MVP - Time Sent"
    }

    %% ==========================================
    %% Entity Relationships
    %% ==========================================
    Users ||--o| Contractors : "is a"
    Users ||--o| Suppliers : "is a"
    Users ||--o| EquipmentRentals : "is a"

    Contractors ||--o{ Projects : "manages (MVP)"
    Contractors ||--o{ PurchaseOrders : "places (MVP)"
    
    Projects ||--o{ ProjectDocumentation : "stores OCR/QA docs (MVP)"
    Projects ||--o{ PurchaseOrders : "requires (MVP)"

    Suppliers ||--o{ SupplierMaterials : "offers (MVP)"
    MaterialList ||--o{ SupplierMaterials : "offered by (MVP)"
    EquipmentRentals ||--o{ EquipmentList : "lists inventory (MVP)"

    PurchaseOrders ||--o{ OrderMaterials : "contains (MVP)"
    PurchaseOrders ||--o{ OrderEquipment : "contains (MVP)"
    
    MaterialList ||--o{ OrderMaterials : "sold as (MVP)"
    EquipmentList ||--o{ OrderEquipment : "rented as (MVP)"

    Users ||--o{ Notifications : "receives (MVP)"
    PurchaseOrders ||--o{ Notifications : "triggers (MVP)"
```
