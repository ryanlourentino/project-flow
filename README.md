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
|  Low | Green | Optional or lower-priority functions |

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

		%% Contractor Homepage
		subgraph Contractors["Contractor Dashboard"]
			Co1 --> Pro1["Procurement Team"]
			Co1 --> SE1["Site Engineer"]

			Pro1 --> Pro2["Registration"]
			Pro1 --> Pro3["Login"]
			Pro2 --> Pro3
			Pro3 --> Pro4["Dashboard"]
			Pro4 --> Pro5["Supplier List"]
			Pro4 --> Pro6["Rental Partner"]

			SE1 --> SE2["Registration"]
			SE1 --> SE3["Login"]
			SE2 --> SE3
			SE3 --> SE4["Dasboard"]
			SE4 --> SE5["Mobile OCR Scanner"]
			SE4 --> SE6["Project Documentation"]
		end

		%% Supplier Homepage
		subgraph Suppliers["Supplier Dashboard"]
			Sup1 --> Sup2["Registration"]
			Sup1 --> Sup3["Login"]
			Sup2 --> Sup3
			Sup3 --> Sup4["Dashboard"]
		end

		%% Rental Homepage
		subgraph Rentals["Rental Dashboard"]
			ER1 --> ER2["Registration"]
			ER1 --> ER3["Login"]
			ER2 --> ER3
			ER3 --> ER5["Dashboard"]
		end
	end

	%% Direct Navigation Links back to Contact
	Sup1 -.-> D1
	ER1 -.-> D1

	%% Priority Class Assignments
	class A,D,D1,E,Co1,Sup1,Pro1,Pro2,Pro3,Pro4,Pro5,Pro6,SE1,SE2,SE3,SE4,SE5,SE6,Sup2,Sup3,ER1,ER2,ER3,Sup4,ER5 high;
	class B,D2,D3 medium;
	class C,C1,C2,CA1,CA2 low;
```
