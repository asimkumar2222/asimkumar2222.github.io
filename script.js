// Create global scanner instance
let scanner;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    scanner = new BLEScanner();
    
    // //Test: Add direct click handler to verify event binding
    // document.getElementById('scanBtn').addEventListener('click', () => {
    //    console.log("Scan button clicked directly!");
   // });
});
class BLEScanner {
    constructor() {
        this.device = null;
        this.server = null;
        this.services = new Map();
        this.selectedCharacteristic = null;
        this.notifications = new Map();
        this.discoveredDevices = [];
        this.isScanning = false;

        this.initializeElements();
        this.bindEvents();
        this.checkBluetoothSupport();
    }

    initializeElements() {
        // Buttons
        this.scanBtn = document.getElementById('scanBtn');
        this.disconnectBtn = document.getElementById('disconnectBtn');
        this.readBtn = document.getElementById('readBtn');
        this.writeBtn = document.getElementById('writeBtn');
        this.notifyBtn = document.getElementById('notifyBtn');
        this.stopNotifyBtn = document.getElementById('stopNotifyBtn');

        // Selects and inputs
        this.characteristicSelect = document.getElementById('characteristicSelect');
        this.writeValue = document.getElementById('writeValue');
        this.filterName = document.getElementById('filterName');
        this.filterService = document.getElementById('filterService');

        // Display elements
        this.deviceList = document.getElementById('deviceList');
        this.servicesList = document.getElementById('servicesList');
        this.currentValue = document.getElementById('currentValue');
        this.notificationList = document.getElementById('notificationList');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.deviceInfo = document.getElementById('deviceInfo');

        // Value displays
        this.valueHex = document.getElementById('valueHex');
        this.valueAscii = document.getElementById('valueAscii');
        this.valueDecimal = document.getElementById('valueDecimal');

        // Modal
        this.modal = document.getElementById('detailsModal');
        this.modalDetails = document.getElementById('modalDetails');
        this.modalTitle = document.getElementById('modalTitle');
        this.closeModal = document.querySelector('.close');
    }

    bindEvents() {
        this.scanBtn.addEventListener('click', () => this.scanDevices());
        this.disconnectBtn.addEventListener('click', () => this.disconnect());
        this.readBtn.addEventListener('click', () => this.readCharacteristic());
        this.writeBtn.addEventListener('click', () => this.writeCharacteristic());
        this.notifyBtn.addEventListener('click', () => this.startNotifications());
        this.stopNotifyBtn.addEventListener('click', () => this.stopNotifications());
        
        this.characteristicSelect.addEventListener('change', (e) => this.selectCharacteristic(e.target.value));
        this.filterName.addEventListener('input', () => this.filterDevices());
        this.filterService.addEventListener('change', () => this.filterDevices());
        this.closeModal.addEventListener('click', () => this.modal.style.display = 'none');
        
        window.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.modal.style.display = 'none';
            }
        });
    }

    async checkBluetoothSupport() {
        console.log(0); // This works fine
        console.log("Starting async function CheckBLE Support...");
        if (!navigator.bluetooth) {
            this.showError('Web Bluetooth API is not supported in this browser. Try Chrome/Edge 56+');
            this.scanBtn.disabled = true;
            return false;
        }
        
        if (!navigator.bluetooth.requestDevice) {
            this.showError('Bluetooth permissions not granted. Make sure the page is served over HTTPS.');
            this.scanBtn.disabled = true;
            return false;
        }
        
        return true;
    }

    async scanDevices() {
        console.log(0); // This works fine
        console.log("Starting async function ScanDevices...");
        if (this.isScanning) return;
        
        try {
            this.isScanning = true;
            this.scanBtn.disabled = true;
            this.scanBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...';
            
            // Request device with service filters
            const filters = [];
            const selectedService = this.filterService.value;
            
            if (selectedService) {
                filters.push({ services: [selectedService] });
            } else {
                filters.push({ services: [] }); // Allow all services
            }
            
            const options = {
                optionalServices: ['battery_service', 'device_information', 'generic_access'],
                acceptAllDevices: true
            };
                //filters: filters,
                //optionalServices: ['battery_service', 'device_information', 'generic_access'],
            this.device = await navigator.bluetooth.requestDevice(options);
            
            this.device.addEventListener('gattserverdisconnected', () => {
                this.onDisconnected();
            });
            
            await this.connectToDevice();
            
        } catch (error) {
            if (error.name !== 'NotFoundError') {
                console.error('Error scanning devices:', error);
                this.showError(`Scan failed: ${error.message}`);
            }
        } finally {
            this.isScanning = false;
            this.scanBtn.disabled = false;
            this.scanBtn.innerHTML = '<i class="fas fa-search"></i> Scan for Devices';
        }
    }

    async connectToDevice() {
        try {
            this.connectionStatus.className = 'status connecting';
            this.connectionStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
            
            this.server = await this.device.gatt.connect();
            
            this.connectionStatus.className = 'status connected';
            this.connectionStatus.innerHTML = '<i class="fas fa-circle"></i> Connected';
            
            this.deviceInfo.textContent = `Device: ${this.device.name || 'Unknown'} | ID: ${this.device.id}`;
            
            this.disconnectBtn.disabled = false;
            
            await this.discoverServices();
            
        } catch (error) {
            console.error('Connection failed:', error);
            this.showError(`Connection failed: ${error.message}`);
            this.onDisconnected();
        }
    }

    async discoverServices() {
        try {
            this.servicesList.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Discovering services...</p></div>';
            
            const services = await this.server.getPrimaryServices();
            this.services.clear();
            
            let servicesHTML = '';
            
            for (const service of services) {
                const characteristics = await service.getCharacteristics();
                this.services.set(service.uuid, { service, characteristics });
                
                const serviceName = this.getServiceName(service.uuid);
                servicesHTML += `
                    <div class="service-item" onclick="scanner.showServiceDetails('${service.uuid}')">
                        <div class="service-name">${serviceName}</div>
                        <div class="device-id">UUID: ${service.uuid}</div>
                        <div class="characteristic-properties">
                            ${characteristics.map(char => `
                                <span class="property-badge ${this.getPropertyClass(char.properties)}"
                                      onclick="event.stopPropagation(); scanner.selectCharacteristicForInteraction('${service.uuid}', '${char.uuid}')">
                                    ${this.getPropertyAbbreviation(char.properties)}
                                </span>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
            
            this.servicesList.innerHTML = servicesHTML || '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>No services found</p></div>';
            
            this.populateCharacteristicSelect();
            
        } catch (error) {
            console.error('Service discovery failed:', error);
            this.showError(`Service discovery failed: ${error.message}`);
        }
    }

    getPropertyClass(properties) {
        if (properties.read && properties.write && properties.notify) return 'read write notify';
        if (properties.read && properties.write) return 'read write';
        if (properties.read && properties.notify) return 'read notify';
        if (properties.write && properties.notify) return 'write notify';
        if (properties.read) return 'read';
        if (properties.write) return 'write';
        if (properties.notify) return 'notify';
        return '';
    }

    getPropertyAbbreviation(properties) {
        const props = [];
        if (properties.read) props.push('R');
        if (properties.write) props.push('W');
        if (properties.writeWithoutResponse) props.push('WoR');
        if (properties.notify) props.push('N');
        if (properties.indicate) props.push('I');
        return props.join(', ');
    }

    async selectCharacteristicForInteraction(serviceUUID, characteristicUUID) {
        const serviceData = this.services.get(serviceUUID);
        if (!serviceData) return;
        
        const characteristic = serviceData.characteristics.find(c => c.uuid === characteristicUUID);
        if (!characteristic) return;
        
        this.selectedCharacteristic = characteristic;
        this.characteristicSelect.value = characteristicUUID;
        
        this.updateButtonStates();
        
        // Auto-read if characteristic is readable
        if (characteristic.properties.read) {
            await this.readCharacteristic();
        }
    }

    async readCharacteristic() {
        if (!this.selectedCharacteristic || !this.selectedCharacteristic.properties.read) {
            this.showError('Characteristic does not support read');
            return;
        }
        
        try {
            const value = await this.selectedCharacteristic.readValue();
            this.displayValue(value);
            
        } catch (error) {
            console.error('Read failed:', error);
            this.showError(`Read failed: ${error.message}`);
        }
    }

    async writeCharacteristic() {
        if (!this.selectedCharacteristic || !this.selectedCharacteristic.properties.write) {
            this.showError('Characteristic does not support write');
            return;
        }
        
        const input = this.writeValue.value.trim();
        if (!input) {
            this.showError('Please enter a value to write');
            return;
        }
        
        try {
            // Convert hex string to bytes
            const bytes = this.hexStringToBytes(input);
            const arrayBuffer = new Uint8Array(bytes).buffer;
            
            await this.selectedCharacteristic.writeValue(arrayBuffer);
            
            this.showMessage(`Value written: ${input}`);
            
            // Read back the value if readable
            if (this.selectedCharacteristic.properties.read) {
                setTimeout(() => this.readCharacteristic(), 500);
            }
            
        } catch (error) {
            console.error('Write failed:', error);
            this.showError(`Write failed: ${error.message}`);
        }
    }

    async startNotifications() {
        if (!this.selectedCharacteristic || !this.selectedCharacteristic.properties.notify) {
            this.showError('Characteristic does not support notifications');
            return;
        }
        
        try {
            await this.selectedCharacteristic.startNotifications();
            
            this.selectedCharacteristic.addEventListener('characteristicvaluechanged', 
                (event) => this.handleNotification(event));
            
            this.notifications.set(this.selectedCharacteristic.uuid, true);
            this.updateButtonStates();
            
            this.showMessage('Notifications started');
            
        } catch (error) {
            console.error('Failed to start notifications:', error);
            this.showError(`Failed to start notifications: ${error.message}`);
        }
    }

    async stopNotifications() {
        if (!this.selectedCharacteristic) return;
        
        try {
            await this.selectedCharacteristic.stopNotifications();
            
            this.notifications.delete(this.selectedCharacteristic.uuid);
            this.updateButtonStates();
            
            this.showMessage('Notifications stopped');
            
        } catch (error) {
            console.error('Failed to stop notifications:', error);
            this.showError(`Failed to stop notifications: ${error.message}`);
        }
    }

    handleNotification(event) {
        const value = event.target.value;
        this.displayValue(value);
        
        // Add to notification log
        const timestamp = new Date().toLocaleTimeString();
        const hexValue = this.bytesToHexString(new Uint8Array(value.buffer));
        
        const notificationItem = document.createElement('div');
        notificationItem.className = 'notification-item';
        notificationItem.innerHTML = `
            <time>${timestamp}</time> - ${hexValue}
        `;
        
        this.notificationList.prepend(notificationItem);
        
        // Keep only last 50 notifications
        const items = this.notificationList.querySelectorAll('.notification-item');
        if (items.length > 50) {
            items[items.length - 1].remove();
        }
    }

    displayValue(value) {
        if (!value) return;
        
        const bytes = new Uint8Array(value.buffer);
        const hexString = this.bytesToHexString(bytes);
        const asciiString = this.bytesToAsciiString(bytes);
        const decimalValue = bytes.length === 1 ? bytes[0] : 'N/A';
        
        this.currentValue.innerHTML = `<span>${hexString}</span>`;
        this.valueHex.textContent = `Hex: ${hexString}`;
        this.valueAscii.textContent = `ASCII: ${asciiString}`;
        this.valueDecimal.textContent = `Decimal: ${decimalValue}`;
    }

    hexStringToBytes(hexString) {
        hexString = hexString.replace(/\s/g, '');
        if (hexString.length % 2 !== 0) {
            throw new Error('Invalid hex string');
        }
        
        const bytes = [];
        for (let i = 0; i < hexString.length; i += 2) {
            bytes.push(parseInt(hexString.substr(i, 2), 16));
        }
        return bytes;
    }

    bytesToHexString(bytes) {
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join(' ').toUpperCase();
    }

    bytesToAsciiString(bytes) {
        return Array.from(bytes)
            .map(b => {
                const charCode = b;
                return charCode >= 32 && charCode <= 126 ? 
                    String.fromCharCode(charCode) : '.';
            })
            .join('');
    }

    populateCharacteristicSelect() {
        this.characteristicSelect.innerHTML = '<option value="">Select a characteristic</option>';
        
        for (const [serviceUUID, serviceData] of this.services) {
            for (const characteristic of serviceData.characteristics) {
                const serviceName = this.getServiceName(serviceUUID);
                const charName = this.getCharacteristicName(characteristic.uuid);
                
                const option = document.createElement('option');
                option.value = characteristic.uuid;
                option.textContent = `${charName} (${serviceName})`;
                option.dataset.service = serviceUUID;
                option.dataset.characteristic = characteristic;
                
                this.characteristicSelect.appendChild(option);
            }
        }
        
        this.characteristicSelect.disabled = this.characteristicSelect.options.length <= 1;
    }

    selectCharacteristic(value) {
        if (!value) {
            this.selectedCharacteristic = null;
            this.updateButtonStates();
            return;
        }
        
        // Find the characteristic in our services map
        for (const [serviceUUID, serviceData] of this.services) {
            const characteristic = serviceData.characteristics.find(c => c.uuid === value);
            if (characteristic) {
                this.selectedCharacteristic = characteristic;
                this.updateButtonStates();
                return;
            }
        }
    }

    updateButtonStates() {
        if (!this.selectedCharacteristic) {
            this.readBtn.disabled = true;
            this.writeBtn.disabled = true;
            this.notifyBtn.disabled = true;
            this.stopNotifyBtn.disabled = true;
            this.writeValue.disabled = true;
            return;
        }
        
        const props = this.selectedCharacteristic.properties;
        this.readBtn.disabled = !props.read;
        this.writeBtn.disabled = !props.write && !props.writeWithoutResponse;
        this.notifyBtn.disabled = !props.notify || this.notifications.has(this.selectedCharacteristic.uuid);
        this.stopNotifyBtn.disabled = !this.notifications.has(this.selectedCharacteristic.uuid);
        this.writeValue.disabled = !props.write && !props.writeWithoutResponse;
    }

    async showServiceDetails(serviceUUID) {
        const serviceData = this.services.get(serviceUUID);
        if (!serviceData) return;
        
        const details = {
            service: {
                uuid: serviceData.service.uuid,
                name: this.getServiceName(serviceData.service.uuid),
                isPrimary: true
            },
            characteristics: []
        };
        
        for (const characteristic of serviceData.characteristics) {
            details.characteristics.push({
                uuid: characteristic.uuid,
                name: this.getCharacteristicName(characteristic.uuid),
                properties: {
                    read: characteristic.properties.read,
                    write: characteristic.properties.write,
                    writeWithoutResponse: characteristic.properties.writeWithoutResponse,
                    notify: characteristic.properties.notify,
                    indicate: characteristic.properties.indicate
                }
            });
        }
        
        this.modalTitle.textContent = `Service: ${this.getServiceName(serviceUUID)}`;
        this.modalDetails.textContent = JSON.stringify(details, null, 2);
        this.modal.style.display = 'block';
    }

    getServiceName(uuid) {
        const serviceNames = {
            '00001800-0000-1000-8000-00805f9b34fb': 'Generic Access',
            '00001801-0000-1000-8000-00805f9b34fb': 'Generic Attribute',
            '0000180a-0000-1000-8000-00805f9b34fb': 'Device Information',
            '0000180f-0000-1000-8000-00805f9b34fb': 'Battery Service',
            '0000180d-0000-1000-8000-00805f9b34fb': 'Heart Rate',
            '00001802-0000-1000-8000-00805f9b34fb': 'Immediate Alert',
            '00001803-0000-1000-8000-00805f9b34fb': 'Link Loss',
            '00001804-0000-1000-8000-00805f9b34fb': 'Tx Power',
        };
        
        return serviceNames[uuid.toLowerCase()] || `Service (${uuid})`;
    }

    getCharacteristicName(uuid) {
        const charNames = {
            '00002a00-0000-1000-8000-00805f9b34fb': 'Device Name',
            '00002a01-0000-1000-8000-00805f9b34fb': 'Appearance',
            '00002a04-0000-1000-8000-00805f9b34fb': 'Peripheral Preferred Connection Parameters',
            '00002a05-0000-1000-8000-00805f9b34fb': 'Service Changed',
            '00002a19-0000-1000-8000-00805f9b34fb': 'Battery Level',
            '00002a29-0000-1000-8000-00805f9b34fb': 'Manufacturer Name String',
            '00002a24-0000-1000-8000-00805f9b34fb': 'Model Number String',
            '00002a25-0000-1000-8000-00805f9b34fb': 'Serial Number String',
            '00002a27-0000-1000-8000-00805f9b34fb': 'Hardware Revision String',
            '00002a26-0000-1000-8000-00805f9b34fb': 'Firmware Revision String',
            '00002a28-0000-1000-8000-00805f9b34fb': 'Software Revision String',
            '00002a37-0000-1000-8000-00805f9b34fb': 'Heart Rate Measurement',
            '00002a38-0000-1000-8000-00805f9b34fb': 'Body Sensor Location',
            '00002a39-0000-1000-8000-00805f9b34fb': 'Heart Rate Control Point',
        };
        
        return charNames[uuid.toLowerCase()] || `Characteristic (${uuid})`;
    }
}
