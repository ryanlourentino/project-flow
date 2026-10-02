# Project Flow
Software Engineering in Construction Management - Assignment #2

## Student Information
| Name | Student ID |
|------|-------------|
| Ryan Lourentino A. | M11505803 |
| 羅奕展 | M11505505 |


## Priority Legend

| Priority | Color | Meaning |
|---|---|---|
|  High | Red | Core functions that should be implemented first |
|  Medium | Yellow | Important functions implemented after the core functions |
|  Low | Green | Optional or lower-priority functions |

```mermaid 
graph LR

	classDef high fill:#ff4d4f,stroke:#a8071a,stroke-width:2px,color:#ffffff;
	classDef medium fill:#faad14,stroke:#ad6800,stroke-width:2px,color:#ffffff;
	classDef low fill:#52c41a,stroke:#237804,stroke-width:2px,color:#ffffff;


	A[Homepage] --> B(About Us)
	A --> E(Services)
	A --> C(Blog)
	A --> D(Contact Us)

	C --> C1(Our Team)
	C --> C2(Our History)

	C1 --> CA1(Profile: Ryan Lourentino)
	C1 --> CA2(Profile: 羅奕展)

	E --> Co1(For Contractors)
	E --> Sup1(For Suppliers)
	E --> ER1(For Equipment Rental)

	Co1 --> Pro1(Procurement Team)
	Co1 --> SE1(Site Engineer)
	Co1 --> E

	Pro1 --> Pro2(Registration)
	Pro1 --> Pro3(Login)
	Pro2 --> Pro3

	SE1 --> SE2(Registration)
	SE1 --> SE3(Login)
	SE2 --> SE3

	Sup1 --> Sup2(Registration)
	Sup1 --> Sup3(Login)
	Sup2 --> Sup3
	Sup1 --> D

	ER1 --> ER2(Registration)
	ER1 --> ER3(Login)
	ER2 --> ER3
	ER1 --> D

	D --> D1(Map & Directions)
	D --> D2(Contact Form)

	%%DefPriority
	class A,E,Co1,Sup1,Pro1,Pro2,Pro3,SE1,SE2,SE3,Sup2,Sup3,ER1,ER2,ER3 high;
	class D,D1,D2 medium;
	class C,C1,C2,CA1,CA2 low;
```
