# Patient CRUD API Documentation

This document describes the complete CRUD (Create, Read, Update, Delete) API implementation for the Patient table.

## Database Schema

The Patient table includes the following fields:

- `id` (varchar, primary key, auto-generated in format PTddmmyy-001)
- `patient_name` (varchar, required)
- `condition` (varchar, required)
- `therapy_id` (varchar, foreign key to therapy table)
- `insurance_provider` (varchar, optional)
- `insurance_type` (varchar, optional)
- `docs_report` (BYTEA, optional - for storing document files)
- `hospital_name` (varchar, optional)
- `location` (varchar, optional)
- `provider_id` (varchar, foreign key to provider table)
- `pharma_id` (varchar, foreign key to pharma table)
- `stage_id` (int, foreign key to stage table)
- `created_at` (timestamp, auto-generated)
- `updated_at` (timestamp, auto-updated)
- `created_by` (varchar, optional)
- `updated_by` (varchar, optional)

## API Endpoints

### Base URL

All patient endpoints are prefixed with `/patients`

### 1. Create Single or Multiple Patients

- **POST** `/patients/`
- **Description**: Create single or multiple patient records
- **Request Body**: PatientCreateRequest (accepts single patient or array)
- **Response**: PatientCreateResponse (201 Created)

**Sample Request (Single Patient):**

```json
{
  "patient_name": "John Doe",
  "condition": "Acute Lymphoblastic Leukemia (ALL)",
  "therapy_id": "car-t-all-001",
  "insurance_provider": "Blue Cross Blue Shield",
  "insurance_type": "private",
  "hospital_name": "Memorial Sloan Kettering Cancer Center",
  "location": "New York, NY",
  "provider_id": "oncologist_001",
  "pharma_id": "novartis_001",
  "stage_id": 4,
  "created_by": "dr_smith"
}
```

**Sample Request (Multiple Patients):**

```json
[
  {
    "patient_name": "Sarah Johnson",
    "condition": "Acute Lymphoblastic Leukemia (ALL)",
    "therapy_id": "car-t-all-001",
    "insurance_provider": "Blue Cross Blue Shield",
    "insurance_type": "private",
    "hospital_name": "Memorial Sloan Kettering Cancer Center",
    "location": "New York, NY",
    "provider_id": "oncologist_001",
    "pharma_id": "novartis_001",
    "stage_id": 4,
    "created_by": "dr_smith"
  },
  {
    "patient_name": "Mike Wilson",
    "condition": "Lymphoma",
    "therapy_id": "car-t-all-003",
    "insurance_provider": "Aetna",
    "insurance_type": "private",
    "hospital_name": "Johns Hopkins Hospital",
    "location": "Baltimore, MD",
    "provider_id": "oncologist_002",
    "pharma_id": "novartis_002",
    "stage_id": 2,
    "created_by": "dr_smith"
  }
]
```

**Sample Response:**

```json
{
  "patients": [
    {
      "id": "PT131025-001",
      "patient_name": "John Doe",
      "condition": "Acute Lymphoblastic Leukemia (ALL)",
      "therapy_id": "car-t-all-001",
      "insurance_provider": "Blue Cross Blue Shield",
      "insurance_type": "private",
      "hospital_name": "Memorial Sloan Kettering Cancer Center",
      "location": "New York, NY",
      "provider_id": "oncologist_001",
      "pharma_id": "novartis_001",
      "stage_id": 4,
      "created_at": "2025-10-13T17:43:00.425359+05:30",
      "updated_at": null,
      "created_by": "dr_smith",
      "updated_by": null
    }
  ],
  "total_created": 1,
  "message": "Successfully created 1 patient(s)"
}
```

### 2. Get All Patients

- **GET** `/patients/`
- **Description**: Get all patients without pagination
- **Response**: List[PatientResponse]

**Sample Response:**

```json
[
  {
    "id": "PT131025-001",
    "patient_name": "Sarah Johnson",
    "condition": "Acute Lymphoblastic Leukemia (ALL)",
    "therapy_id": "car-t-all-001",
    "insurance_provider": "Blue Cross Blue Shield",
    "insurance_type": "private",
    "hospital_name": "Memorial Sloan Kettering Cancer Center",
    "location": "New York, NY",
    "provider_id": "oncologist_001",
    "pharma_id": "novartis_001",
    "stage_id": 4,
    "created_at": "2025-10-13T17:43:00.425359+05:30",
    "updated_at": null,
    "created_by": "dr_smith",
    "updated_by": null
  }
]
```

### 3. Get Patient by ID

- **GET** `/patients/{patient_id}`
- **Description**: Get a specific patient by ID
- **Response**: PatientResponse (404 if not found)

**Sample Request:**

```bash
GET /patients/PT131025-001
```

**Sample Response:**

```json
{
  "id": "PT131025-001",
  "patient_name": "Sarah Johnson",
  "condition": "Acute Lymphoblastic Leukemia (ALL)",
  "therapy_id": "car-t-all-001",
  "insurance_provider": "Blue Cross Blue Shield",
  "insurance_type": "private",
  "hospital_name": "Memorial Sloan Kettering Cancer Center",
  "location": "New York, NY",
  "provider_id": "oncologist_001",
  "pharma_id": "novartis_001",
  "stage_id": 4,
  "created_at": "2025-10-13T17:43:00.425359+05:30",
  "updated_at": null,
  "created_by": "dr_smith",
  "updated_by": null
}
```

### 4. Update Patient

- **PUT** `/patients/{patient_id}`
- **Description**: Update patient information
- **Request Body**: PatientUpdate schema
- **Response**: PatientResponse (404 if not found)

**Sample Request:**

```json
{
  "condition": "Acute Lymphoblastic Leukemia (ALL) - In Remission",
  "stage_id": 3,
  "updated_by": "dr_smith"
}
```

**Sample Response:**

```json
{
  "id": "PT131025-001",
  "patient_name": "Sarah Johnson",
  "condition": "Acute Lymphoblastic Leukemia (ALL) - In Remission",
  "therapy_id": "car-t-all-001",
  "insurance_provider": "Blue Cross Blue Shield",
  "insurance_type": "private",
  "hospital_name": "Memorial Sloan Kettering Cancer Center",
  "location": "New York, NY",
  "provider_id": "oncologist_001",
  "pharma_id": "novartis_001",
  "stage_id": 3,
  "created_at": "2025-10-13T17:43:00.425359+05:30",
  "updated_at": "2025-10-13T18:15:30.123456+05:30",
  "created_by": "dr_smith",
  "updated_by": "dr_smith"
}
```

### 5. Delete Patient

- **DELETE** `/patients/{patient_id}`
- **Description**: Delete a patient record
- **Response**: 204 No Content (404 if not found)

**Sample Request:**

```bash
DELETE /patients/PT131025-001
```

### 6. Get Patients by Provider

- **GET** `/patients/provider/{provider_id}`
- **Description**: Get all patients for a specific provider
- **Response**: List[PatientResponse]

**Sample Request:**

```bash
GET /patients/provider/oncologist_001
```

**Sample Response:**

```json
[
  {
    "id": "PT131025-001",
    "patient_name": "Sarah Johnson",
    "condition": "Acute Lymphoblastic Leukemia (ALL)",
    "therapy_id": "car-t-all-001",
    "insurance_provider": "Blue Cross Blue Shield",
    "insurance_type": "private",
    "hospital_name": "Memorial Sloan Kettering Cancer Center",
    "location": "New York, NY",
    "provider_id": "oncologist_001",
    "pharma_id": "novartis_001",
    "stage_id": 4,
    "created_at": "2025-10-13T17:43:00.425359+05:30",
    "updated_at": null,
    "created_by": "dr_smith",
    "updated_by": null
  }
]
```

### 7. Get Patients by Pharma

- **GET** `/patients/pharma/{pharma_id}`
- **Description**: Get all patients for a specific pharma
- **Response**: List[PatientResponse]

**Sample Request:**

```bash
GET /patients/pharma/novartis_001
```

**Sample Response:**

```json
[
  {
    "id": "PT131025-001",
    "patient_name": "Sarah Johnson",
    "condition": "Acute Lymphoblastic Leukemia (ALL)",
    "therapy_id": "car-t-all-001",
    "insurance_provider": "Blue Cross Blue Shield",
    "insurance_type": "private",
    "hospital_name": "Memorial Sloan Kettering Cancer Center",
    "location": "New York, NY",
    "provider_id": "oncologist_001",
    "pharma_id": "novartis_001",
    "stage_id": 4,
    "created_at": "2025-10-13T17:43:00.425359+05:30",
    "updated_at": null,
    "created_by": "dr_smith",
    "updated_by": null
  }
]
```

### 8. Get Pharma Statistics

- **GET** `/patients/statistics/pharma/{pharma_id}`
- **Description**: Get comprehensive statistics for a specific pharma
- **Response**: PharmaStatisticsResponse

**Sample Request:**

```bash
GET /patients/statistics/pharma/novartis_001
```

**Sample Response:**

```json
{
  "pharma_id": "novartis_001",
  "patient_count": 25,
  "treatment_count": 20,
  "top_therapy": {
    "therapy_id": "car-t-all-001",
    "count": 12
  },
  "top_conditions": [
    {
      "condition": "Acute Lymphoblastic Leukemia (ALL)",
      "count": 15
    },
    {
      "condition": "Lymphoma",
      "count": 8
    },
    {
      "condition": "Multiple Myeloma",
      "count": 2
    }
  ],
  "recent_patients": 5,
  "monthly_statistics": [
    {
      "month": "2024-01",
      "patient_count": 2,
      "treatment_count": 1
    },
    {
      "month": "2024-02",
      "patient_count": 3,
      "treatment_count": 2
    },
    {
      "month": "2024-03",
      "patient_count": 1,
      "treatment_count": 1
    },
    {
      "month": "2024-04",
      "patient_count": 4,
      "treatment_count": 3
    },
    {
      "month": "2024-05",
      "patient_count": 2,
      "treatment_count": 2
    },
    {
      "month": "2024-06",
      "patient_count": 3,
      "treatment_count": 2
    },
    {
      "month": "2024-07",
      "patient_count": 2,
      "treatment_count": 1
    },
    {
      "month": "2024-08",
      "patient_count": 1,
      "treatment_count": 1
    },
    {
      "month": "2024-09",
      "patient_count": 3,
      "treatment_count": 3
    },
    {
      "month": "2024-10",
      "patient_count": 2,
      "treatment_count": 2
    },
    {
      "month": "2024-11",
      "patient_count": 1,
      "treatment_count": 1
    },
    {
      "month": "2024-12",
      "patient_count": 1,
      "treatment_count": 1
    }
  ]
}
```

### 9. Advanced Search

- **GET** `/patients/search/advanced`
- **Description**: Advanced search with multiple filters
- **Query Parameters**: All patient fields as optional filters
- **Response**: List[PatientResponse]

**Sample Request:**

```bash
GET /patients/search/advanced?patient_name=Sarah&condition=ALL&pharma_id=novartis_001&stage_id=4
```

**Query Parameters:**

- `patient_name` (string, optional): Filter by patient name (partial match)
- `condition` (string, optional): Filter by condition (partial match)
- `hospital_name` (string, optional): Filter by hospital name (partial match)
- `insurance_provider` (string, optional): Filter by insurance provider (partial match)
- `therapy_id` (string, optional): Filter by therapy ID (exact match)
- `provider_id` (string, optional): Filter by provider ID (exact match)
- `pharma_id` (string, optional): Filter by pharma ID (exact match)
- `stage_id` (integer, optional): Filter by stage ID (exact match)

**Sample Response:**

```json
[
  {
    "id": "PT131025-001",
    "patient_name": "Sarah Johnson",
    "condition": "Acute Lymphoblastic Leukemia (ALL)",
    "therapy_id": "car-t-all-001",
    "insurance_provider": "Blue Cross Blue Shield",
    "insurance_type": "private",
    "hospital_name": "Memorial Sloan Kettering Cancer Center",
    "location": "New York, NY",
    "provider_id": "oncologist_001",
    "pharma_id": "novartis_001",
    "stage_id": 4,
    "created_at": "2025-10-13T17:43:00.425359+05:30",
    "updated_at": null,
    "created_by": "dr_smith",
    "updated_by": null
  }
]
```

## Data Schemas

### PatientCreate

```json
{
  "patient_name": "string (required, 1-255 chars)",
  "condition": "string (required, 1-500 chars)",
  "therapy_id": "string (optional)",
  "insurance_provider": "string (optional, max 255 chars)",
  "insurance_type": "string (optional, max 100 chars)",
  "hospital_name": "string (optional, max 255 chars)",
  "location": "string (optional, max 255 chars)",
  "provider_id": "string (optional)",
  "pharma_id": "string (optional)",
  "stage_id": "integer (optional)",
  "created_by": "string (optional, max 255 chars)",
  "updated_by": "string (optional, max 255 chars)"
}
```

### PatientUpdate

```json
{
  "patient_name": "string (optional, 1-255 chars)",
  "condition": "string (optional, 1-500 chars)",
  "therapy_id": "string (optional)",
  "insurance_provider": "string (optional, max 255 chars)",
  "insurance_type": "string (optional, max 100 chars)",
  "hospital_name": "string (optional, max 255 chars)",
  "location": "string (optional, max 255 chars)",
  "provider_id": "string (optional)",
  "pharma_id": "string (optional)",
  "stage_id": "integer (optional)",
  "updated_by": "string (optional, max 255 chars)"
}
```

### PatientResponse

```json
{
  "id": "string (auto-generated PT-ddmmyy001 format)",
  "patient_name": "string",
  "condition": "string",
  "therapy_id": "string",
  "insurance_provider": "string",
  "insurance_type": "string",
  "hospital_name": "string",
  "location": "string",
  "provider_id": "string",
  "pharma_id": "string",
  "stage_id": "integer",
  "created_at": "datetime (ISO format)",
  "updated_at": "datetime (ISO format) or null",
  "created_by": "string",
  "updated_by": "string"
}
```

### PharmaStatisticsResponse

```json
{
  "pharma_id": "string",
  "patient_count": "integer",
  "treatment_count": "integer",
  "top_therapy": {
    "therapy_id": "string",
    "count": "integer"
  },
  "top_conditions": [
    {
      "condition": "string",
      "count": "integer"
    }
  ],
  "recent_patients": "integer (last 30 days)",
  "monthly_statistics": [
    {
      "month": "string (YYYY-MM format)",
      "patient_count": "integer",
      "treatment_count": "integer"
    }
  ]
}
```

## Test Data Examples

### Sample Patient Records

```json
[
  {
    "patient_name": "John Doe",
    "condition": "Lymphoma",
    "therapy_id": "car-t-all-003",
    "insurance_provider": "Blue Cross",
    "insurance_type": "private",
    "hospital_name": "Health and Wealth",
    "location": "London",
    "provider_id": "oncologist_005",
    "pharma_id": "novartis_008",
    "stage_id": 2,
    "created_by": "dr_smith"
  },
  {
    "patient_name": "Steve",
    "condition": "Acute Lymphoblastic Leukemia (ALL)",
    "therapy_id": "car-t-all-007",
    "insurance_provider": "Blue Shield",
    "insurance_type": "private",
    "hospital_name": "Kettering Cancer Center",
    "location": "Canada",
    "provider_id": "oncologist_008",
    "pharma_id": "novartis_009",
    "stage_id": 1,
    "created_by": "dr_smith"
  },
  {
    "patient_name": "Sarah Johnson",
    "condition": "Acute Lymphoblastic Leukemia (ALL)",
    "therapy_id": "car-t-all-001",
    "insurance_provider": "Blue Cross Blue Shield",
    "insurance_type": "private",
    "hospital_name": "Memorial Sloan Kettering Cancer Center",
    "location": "New York, NY",
    "provider_id": "oncologist_001",
    "pharma_id": "novartis_001",
    "stage_id": 4,
    "created_by": "dr_smith"
  }
]
```

## Architecture

The implementation follows a clean architecture pattern with clear separation of concerns:

### 1. Model Layer (`models/patient_model.py`)

- SQLAlchemy model definition
- Database table mapping
- Relationships with other tables

### 2. Schema Layer (`schemas/patient_schema.py`)

- Pydantic models for request/response validation
- Data serialization/deserialization
- Input validation rules

### 3. Repository Layer (`repository/patient_repository.py`)

- Database operations
- Query building
- Data persistence logic

### 4. Service Layer (`service/patient_service.py`)

- Business logic
- Data transformation
- Validation rules
- Error handling

### 5. Controller Layer (`controller/patient_controller.py`)

- API endpoints
- HTTP request/response handling
- Route definitions
- Error responses

### 6. Utils Layer (`utils/patient_utils.py`)

- Patient ID generation utility
- Reusable helper functions

## Error Handling

The API includes comprehensive error handling:

- **400 Bad Request**: Invalid input data
- **404 Not Found**: Resource not found
- **422 Unprocessable Entity**: Validation errors
- **500 Internal Server Error**: Server errors

### Error Response Format

```json
{
  "detail": "Error message description"
}
```

## Features

- **Bulk Operations**: Create multiple patients in a single request
- **Advanced Search**: Multi-field filtering with partial text matching
- **Statistics**: Comprehensive pharma-specific analytics with monthly trends
- **Auto-generated IDs**: Custom patient ID format (PT-ddmmyy001)
- **Validation**: Comprehensive input validation with field length limits
- **Error Handling**: Detailed error responses with proper HTTP status codes
- **Monthly Analytics**: 12-month trend analysis for pharma statistics

## Usage Examples

### Create a new patient:

```bash
curl -X POST "http://localhost:8000/patients/" \
  -H "Content-Type: application/json" \
  -d '{
    "patient_name": "John Doe",
    "condition": "Acute Lymphoblastic Leukemia (ALL)",
    "therapy_id": "car-t-all-001",
    "insurance_provider": "Blue Cross Blue Shield",
    "insurance_type": "private",
    "hospital_name": "Memorial Sloan Kettering Cancer Center",
    "location": "New York, NY",
    "provider_id": "oncologist_001",
    "pharma_id": "novartis_001",
    "stage_id": 4,
    "created_by": "dr_smith"
  }'
```

### Get patients by pharma:

```bash
curl "http://localhost:8000/patients/pharma/novartis_001"
```

### Get pharma statistics:

```bash
curl "http://localhost:8000/patients/statistics/pharma/novartis_001"
```

### Advanced search:

```bash
curl "http://localhost:8000/patients/search/advanced?condition=ALL&pharma_id=novartis_001"
```

### Update patient:

```bash
curl -X PUT "http://localhost:8000/patients/PT131025-001" \
  -H "Content-Type: application/json" \
  -d '{
    "condition": "Acute Lymphoblastic Leukemia (ALL) - In Remission",
    "stage_id": 3,
    "updated_by": "dr_smith"
  }'
```

## Dependencies

- **FastAPI**: Web framework
- **SQLAlchemy**: ORM
- **Pydantic**: Data validation
- **PostgreSQL**: Database
- **psycopg2**: PostgreSQL adapter
