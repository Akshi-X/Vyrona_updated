/**
 * @variant TrackHospital2
 * @hospital ARC Fertility (ID: 2)
 * @route /track/:patientId
 * @owner arc-team@company.com
 * @created 2024-01-15
 * @lastReviewed 2024-06-01
 * @baseComponent pages/Track
 *
 * Custom Track page for ARC Fertility Hospital.
 * This component replaces the default Track page for users
 * belonging to ARC Fertility (hospital_id = 2).
 *
 * FEATURES:
 * - ARC-specific patient tracking layout
 * - Enhanced shipment timeline visualization
 * - Custom temperature monitoring display
 * - ARC branding and styling
 *
 * CHANGELOG:
 * - 2024-06-01: Updated to match base Track v2.3
 * - 2024-03-15: Added enhanced timeline view
 * - 2024-01-15: Initial creation
 */

import React, { useState } from "react";
import { useParams } from "react-router-dom";

/**
 * ARC Fertility custom track page component.
 *
 * This is an example of how to create a hospital-specific variant
 * for a parameterized route. The component will be automatically
 * discovered by the registry based on its file location
 * (hospital-2/Track.tsx).
 *
 * The component key will be: TrackHospital2
 */
const TrackARC: React.FC = () => {
    const { patientId } = useParams<{ patientId: string }>();
    const [activeTab, setActiveTab] = useState<
        "overview" | "timeline" | "temperature"
    >("overview");

    // Mock data - in real implementation, fetch from API
    const shipmentData = {
        patientId: patientId || "Unknown",
        patientName: "Jane Doe",
        shipmentId: "SHP-2024-001",
        status: "In Transit",
        origin: "ARC Chennai",
        destination: "ARC Mumbai",
        estimatedDelivery: "2024-06-15 14:00",
        currentTemp: -196.2,
    };

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            {/* ARC-specific header */}
            <header className="mb-6">
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                    <span>ARC Fertility</span>
                    <span>/</span>
                    <span>Track Shipment</span>
                </div>
                <h1 className="text-3xl font-bold text-blue-900">
                    Patient Tracking - {shipmentData.patientName}
                </h1>
                <p className="text-gray-600 mt-1">
                    Patient ID: {shipmentData.patientId} | Shipment:{" "}
                    {shipmentData.shipmentId}
                </p>
            </header>

            {/* Status Banner */}
            <div className="bg-blue-600 text-white rounded-lg p-4 mb-6 flex items-center justify-between">
                <div>
                    <span className="text-sm opacity-80">Current Status</span>
                    <h2 className="text-2xl font-bold">
                        {shipmentData.status}
                    </h2>
                </div>
                <div className="text-right">
                    <span className="text-sm opacity-80">
                        Estimated Delivery
                    </span>
                    <div className="text-lg font-semibold">
                        {shipmentData.estimatedDelivery}
                    </div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="bg-white rounded-lg shadow-md mb-6">
                <div className="flex border-b">
                    <TabButton
                        label="Overview"
                        isActive={activeTab === "overview"}
                        onClick={() => setActiveTab("overview")}
                    />
                    <TabButton
                        label="Timeline"
                        isActive={activeTab === "timeline"}
                        onClick={() => setActiveTab("timeline")}
                    />
                    <TabButton
                        label="Temperature Log"
                        isActive={activeTab === "temperature"}
                        onClick={() => setActiveTab("temperature")}
                    />
                </div>

                <div className="p-6">
                    {activeTab === "overview" && (
                        <OverviewTab shipmentData={shipmentData} />
                    )}
                    {activeTab === "timeline" && <TimelineTab />}
                    {activeTab === "temperature" && <TemperatureTab />}
                </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-4">
                <button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg font-medium transition-colors">
                    Contact Courier
                </button>
                <button className="flex-1 bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 py-3 px-6 rounded-lg font-medium transition-colors">
                    Download Report
                </button>
                <button className="flex-1 bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 py-3 px-6 rounded-lg font-medium transition-colors">
                    View History
                </button>
            </div>

            {/* Footer note */}
            <div className="mt-6 text-center text-sm text-gray-500">
                This is a custom track page variant for ARC Fertility (Hospital
                ID: 2)
            </div>
        </div>
    );
};

// ============================================================
// Sub-components
// ============================================================

interface TabButtonProps {
    label: string;
    isActive: boolean;
    onClick: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ label, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`px-6 py-4 font-medium transition-colors ${
            isActive
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-800"
        }`}
    >
        {label}
    </button>
);

interface ShipmentData {
    patientId: string;
    patientName: string;
    shipmentId: string;
    status: string;
    origin: string;
    destination: string;
    estimatedDelivery: string;
    currentTemp: number;
}

interface OverviewTabProps {
    shipmentData: ShipmentData;
}

const OverviewTab: React.FC<OverviewTabProps> = ({ shipmentData }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Shipment Details */}
        <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Shipment Details
            </h3>
            <div className="space-y-3">
                <DetailRow
                    label="Shipment ID"
                    value={shipmentData.shipmentId}
                />
                <DetailRow label="Origin" value={shipmentData.origin} />
                <DetailRow
                    label="Destination"
                    value={shipmentData.destination}
                />
                <DetailRow label="Status" value={shipmentData.status} />
            </div>
        </div>

        {/* Temperature Status */}
        <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Temperature Status (ARC Custom)
            </h3>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <span className="text-sm text-green-600">
                            Current Temperature
                        </span>
                        <div className="text-3xl font-bold text-green-700">
                            {shipmentData.currentTemp}°C
                        </div>
                    </div>
                    <div className="text-green-500">
                        <svg
                            className="w-12 h-12"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                        >
                            <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clipRule="evenodd"
                            />
                        </svg>
                    </div>
                </div>
                <p className="text-sm text-green-600 mt-2">
                    Temperature within safe range (-196°C to -190°C)
                </p>
            </div>
        </div>
    </div>
);

interface DetailRowProps {
    label: string;
    value: string;
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value }) => (
    <div className="flex justify-between py-2 border-b border-gray-100">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-900">{value}</span>
    </div>
);

const TimelineTab: React.FC = () => {
  const timelineEvents: TimelineEventProps['event'][] = [
    {
      id: 1,
      time: '2024-06-14 09:00',
      event: 'Shipment created',
      location: 'ARC Chennai',
      status: 'completed',
    },
    {
      id: 2,
      time: '2024-06-14 10:30',
      event: 'Package picked up',
      location: 'ARC Chennai Lab',
      status: 'completed',
    },
    {
      id: 3,
      time: '2024-06-14 14:00',
      event: 'In transit to airport',
      location: 'Chennai',
      status: 'completed',
    },
    {
      id: 4,
      time: '2024-06-14 18:00',
      event: 'Flight departed',
      location: 'Chennai Airport',
      status: 'current',
    },
    {
      id: 5,
      time: '2024-06-15 08:00',
      event: 'Arrival at destination',
      location: 'Mumbai Airport',
      status: 'pending',
    },
    {
      id: 6,
      time: '2024-06-15 14:00',
      event: 'Delivery to clinic',
      location: 'ARC Mumbai',
      status: 'pending',
    },
  ];

    return (
        <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Shipment Timeline (ARC Enhanced View)
            </h3>
            <div className="relative">
                {timelineEvents.map((event, index) => (
                    <TimelineEvent
                        key={event.id}
                        event={event}
                        isLast={index === timelineEvents.length - 1}
                    />
                ))}
            </div>
        </div>
    );
};

interface TimelineEventProps {
    event: {
        id: number;
        time: string;
        event: string;
        location: string;
        status: "completed" | "current" | "pending";
    };
    isLast: boolean;
}

const TimelineEvent: React.FC<TimelineEventProps> = ({ event, isLast }) => {
    const statusColors = {
        completed: "bg-green-500",
        current: "bg-blue-500 animate-pulse",
        pending: "bg-gray-300",
    };

    const textColors = {
        completed: "text-gray-800",
        current: "text-blue-800 font-semibold",
        pending: "text-gray-500",
    };

    return (
        <div className="flex gap-4 pb-6">
            <div className="flex flex-col items-center">
                <div
                    className={`w-4 h-4 rounded-full ${statusColors[event.status]}`}
                />
                {!isLast && <div className="w-0.5 h-full bg-gray-200 mt-1" />}
            </div>
            <div className="flex-1">
                <div className={`${textColors[event.status]}`}>
                    {event.event}
                </div>
                <div className="text-sm text-gray-500">
                    {event.location} • {event.time}
                </div>
            </div>
        </div>
    );
};

const TemperatureTab: React.FC = () => {
    const temperatureLog = [
        { time: "09:00", temp: -196.5 },
        { time: "10:00", temp: -196.3 },
        { time: "11:00", temp: -196.2 },
        { time: "12:00", temp: -196.1 },
        { time: "13:00", temp: -196.2 },
        { time: "14:00", temp: -196.4 },
        { time: "15:00", temp: -196.3 },
        { time: "16:00", temp: -196.2 },
    ];

    return (
        <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Temperature Log (ARC Custom Monitoring)
            </h3>

            {/* Temperature Chart Placeholder */}
            <div className="bg-gray-100 rounded-lg p-8 mb-6 text-center text-gray-500">
                [Temperature Chart Visualization - Integrate with Chart.js]
            </div>

            {/* Temperature Table */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="bg-gray-50">
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                                Time
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                                Temperature
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">
                                Status
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {temperatureLog.map((entry, index) => (
                            <tr
                                key={index}
                                className="border-b border-gray-100"
                            >
                                <td className="px-4 py-3 text-gray-800">
                                    {entry.time}
                                </td>
                                <td className="px-4 py-3 font-mono text-gray-800">
                                    {entry.temp}°C
                                </td>
                                <td className="px-4 py-3">
                                    <span className="px-2 py-1 bg-green-100 text-green-700 text-sm rounded">
                                        Normal
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default TrackARC;
