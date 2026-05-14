"""
This contains the code for calculating the l2n_evoporation_rate based on the weight data that is received from the iot sensor.
The sensor sends a payload with weight, deviceid, timestamp.

We have the database that stores the informations about the device and which tank it is connected to.
Where we also have the information about the tanks_max_capacity (that is when ln2 is full) and the tanks_min_capacity (that is when ln2 is empty).
Also the tank's ideal evaporation rate (that is the rate at which the ln2 evaporates under normal conditions) and the tank's current_evaporation_rate (that is the rate at which the ln2 is currently evaporating based on the previous weight data received from the sensor).
"""
