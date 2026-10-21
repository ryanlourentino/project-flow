# Project Flow
Software Engineering in Construction Management - Assignment #2

## Student Information
| Name | Student ID |
|------|-------------|
| Ryan Lourentino A. | M11505803 |
| 羅奕展 | M11505505 |


## Priority Legend

| Priority | Color | Description |
|---|---|---|
|  High | Red | Core functions that should be implemented first |
|  Medium | Yellow | Important functions implemented after the core functions |
|  Low | Green | Lower-priority and future enhancement functions |

```mermaid 
graph LR
	%% Priority Class Definitions
	classDef high fill:#ff4d4f,stroke:#a8071a,stroke-width:2px,color:#ffffff;
	classDef medium fill:#faad14,stroke:#ad6800,stroke-width:2px,color:#ffffff;
	classDef low fill:#52c41a,stroke:#237804,stroke-width:2px,color:#ffffff;

	%% Public Project Flow Website
    subgraph Public["Public Project Flow Website"]
        A[Homepage] --> B["About Us"]
        A --> C["Blog"]

        C --> C1["Our Team"]
        C --> C2["Our History"]

        C1 --> CA1["Profile: Ryan Lourentino"]
        C1 --> CA2["Profile: 羅奕展"]

        A --> D["Contact Us"]
        A --> E["Services"]
    end

    %% Customer Contact Services
    subgraph Contact["Project Flow Contact Services"]
        D --> D1["Contact Info"]
        D1 --> D2["Map & Directions"]
        D1 --> D3["Contact Form"]
    end

    %% Project Flow Application Section
    subgraph App["Project Flow Application"]
        E --> Co1["For Contractors"]
        E --> Sup1["For Suppliers"]
        E --> ER1["For Equipment Rental"]
		E --> Ad1["For Platform Admins"]

		%% Notification Services
		subgraph Notification["Notification Services"]
			E --> N["Notification Management"]
			N --> N1["Order Notification"]
			N --> N2["Order Processing"]
			N2 --> N3["AI Predictive Order Processing"]
			Pro9 --> N1
		end

        %% Contractor Homepage
        subgraph Contractors["Contractor Dashboard"]
            Co1 --> Pro1["Procurement Team"]
            Co1 --> SE1["Site Engineer"]

            Pro1 --> Pro2["Registration"]
            Pro1 --> Pro3["Login"]
            Pro2 --> Pro3
			SE6 --> SE7["Documentation Storage"]
			SE7 --> SE8["Documentation List"]

            %% Procurement Dashboard
            subgraph Procurement["Procurement Dashboard"]
                Pro3 --> Pro4["Dashboard"]
                Pro4 --> Pro5["Supplier List & Ratings"]
                Pro4 --> Pro6["Rental Partner List"]
                N2 --> Pro7["Auxiliary Reminders"]
				Pro4 --> Pro7
				Pro4 --> SE8
				N1 --> Pro4
				Pro5 --> Pro9["Check Out Order"]
				Pro6 --> Pro9
				N3 --> Pro10["AI Auxiliary Reminders"]
				Pro7 --> Pro10
            end

            SE1 --> SE2["Registration"]
            SE1 --> SE3["Login"]
            SE2 --> SE3

            %% Site Engineer Dashboard
            subgraph SiteEngineer["Site Engineer Dashboard"]
                SE3 --> SE4["Dashboard"]
                SE4 --> SE5["Mobile OCR Scanner"]
                SE4 --> SE6["Project Documentation"]
				SE4 --> SE8
            end
        end

        %% Supplier Homepage
        subgraph Suppliers["Supplier Dashboard"]
            Sup1 --> Sup2["Registration"]
            Sup1 --> Sup3["Login"]
            Sup2 --> Sup3
            Sup3 --> Sup4["Dashboard"]
            Sup4 --> Sup5["Inventory Overview"]
            Sup4 --> Sup6["Customer Management"]
			N1 --> Sup4
        end

        %% Rental Homepage
        subgraph Rentals["Rental Dashboard"]
            ER1 --> ER2["Registration"]
            ER1 --> ER3["Login"]
            ER2 --> ER3
            ER3 --> ER4["Dashboard"]
            ER4 --> ER5["Equipment Overview"]
            ER4 --> ER6["Customer Management"]
			N1 --> ER4
        end

		%% Delivery Services
		subgraph Delivery["Express Delivery Services']
			Pro9 --> ED["Order Processing"]
			ED --> ED1["Assigning Driver & Delivery Truck"]

		%% Admin Portal
        subgraph Admin["Platform Administration"]
            Ad1 --> Ad2["Login"] --> Ad3["Admin Console"]
            Ad3 --> Ad4["Supplier Verification Gate"]
            Ad3 --> Ad5["Marketplace Quality Control"]
        end
    end

	%% Direct Navigation Links back to Contact
	Sup1 -.-> D1
	ER1 -.-> D1

	%% Priority Class Assignments
	class A,Ad1,Ad2,Ad3,Ad4,Co1,D,D1,E,ER1,ER2,ER3,ER4,ER5,N,PM1,PM2,PM3,PM5,Pro1,Pro2,Pro3,Pro4,SE1,SE2,SE3,SE4,SE6,Sup1,Sup2,Sup3,Sup4 high;
	class Ad5,B,D2,D3,ER6,N1,N2,PM4,Pro5,Pro6,Pro7,Pro8,Pro9,SE5,SE7,SE8,Sup5,Sup6 medium;
	class C,C1,C2,CA1,CA2,ED,ED1,N3,Pro10 low;
```
